#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const normalize = (value) => String(value || '').normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();

const lexicon = read('server/data/lexicon.json');
const lessons = read('server/data/lessons.json');
const candidateLessonFiles = fs.readdirSync(path.join(ROOT, 'content/review'))
  .filter((file) => file.endsWith('-lessons.json'))
  .sort();
const candidateLessons = candidateLessonFiles.flatMap((file) => read(`content/review/${file}`));
const archive = Object.values(read('server/data/archive/lr_3k.json'));
const archiveRanks = new Map(archive.map((word) => [normalize(word.word), word.rank]));
const lessonWordIds = new Set(lessons.flatMap((lesson) => lesson.segments.flatMap((segment) => segment.wordIds)));
const candidateWordIds = new Set(candidateLessons.flatMap((lesson) => lesson.segments.flatMap((segment) => segment.wordIds)));
const byVietnamese = new Map(lexicon.map((word) => [normalize(word.vi), word]));

const domains = [
  { range: [101, 150], name: '人稱、疑問、數字、時間、金錢', required: ['tôi', 'bao nhiêu', 'cảm ơn', 'hai', 'hôm nay', 'tiền'] },
  { range: [151, 200], name: '交通、方向、住宿、居家', required: ['xe', 'sân bay', 'bên trái', 'đi bộ', 'khách sạn', 'nhà vệ sinh'] },
  { range: [201, 250], name: '購物、健康、求助、常用動作', required: ['mua', 'thanh toán', 'giúp', 'bệnh viện', 'nhà thuốc'] },
  { range: [251, 300], name: '社交、家庭、工作、常用描述', required: ['gia đình', 'công việc', 'đồng nghiệp', 'thích', 'nhiều', 'thường'] },
  { range: [301, 350], name: '句子連接、思考、溝通與常用動作', required: ['đang', 'nếu', 'để', 'hỏi', 'nhớ', 'bắt đầu'] },
  { range: [351, 400], name: '常用描述、程度時間與餐飲基本詞', required: ['sai', 'sạch', 'có thể', 'nhà hàng', 'cà phê', 'đói'] },
  { range: [401, 450], name: '食物烹調、機場通關與聯絡', required: ['phở', 'nước mắm', 'nấu', 'chuyến bay', 'nhập cảnh', 'mật khẩu'] },
  { range: [451, 500], name: '租屋居家、衣著尺寸與顏色', required: ['căn hộ', 'tiền cọc', 'máy giặt', 'kích cỡ', 'mặc', 'xanh'] },
  { range: [501, 550], name: '餐飲服務、消費付款與天氣', required: ['hải sản', 'phục vụ', 'mang về', 'giảm giá', 'thời tiết', 'mưa'] },
  { range: [551, 600], name: '溝通、工作計畫與抽象日常', required: ['hy vọng', 'kế hoạch', 'cơ hội', 'đăng ký', 'theo dõi', 'có vẻ'] },
  { range: [601, 650], name: '工作協作、科技與生活互動', required: ['quản lý', 'công nghệ', 'hoàn thành', 'chăm sóc', 'tương lai', 'ứng dụng'] },
  { range: [651, 700], name: '旅行活動、學習操作與安全提醒', required: ['du lịch', 'chú ý', 'dữ liệu', 'cẩn thận', 'giải thích', 'màn hình'] },
  { range: [701, 750], name: '方法社會、資訊處理與自然環境', required: ['phương pháp', 'nội dung', 'môi trường', 'kết quả', 'hướng dẫn', 'tập trung'] },
  { range: [751, 800], name: '常見資訊、職場系統與健康狀態', required: ['chi phí', 'trải nghiệm', 'tình trạng', 'máy tính', 'sức khỏe', 'tiết kiệm'] },
  { range: [801, 850], name: '學習服務、行政健康與常見動作', required: ['giải pháp', 'điều trị', 'tài chính', 'văn hóa', 'địa điểm', 'đồng hồ'] },
  { range: [851, 900], name: '學習工作、文化資訊與情境理解', required: ['tình huống', 'kỹ năng', 'giáo dục', 'kiến thức', 'thế giới', 'truyền thống'] },
  { range: [901, 950], name: '安全提示、數位操作與公共生活', required: ['dấu hiệu', 'âm thanh', 'xác nhận', 'tìm kiếm', 'tài khoản', 'sắp xếp'] },
  { range: [951, 1000], name: '健康程序、數位服務與社會概念', required: ['phương tiện', 'phẫu thuật', 'bảo hiểm', 'thủ tục', 'đất nước', 'hành trình'] },
];
for (let start = 1001; start <= 2000; start += 50) {
  domains.push({ range: [start, start + 49], name: `進階高頻詞 ${Math.ceil((start - 1000) / 50)}`, required: [] });
}

assert.ok(lexicon.length >= 300 && lexicon.length <= 2000 && lexicon.length % 50 === 0, 'Vocabulary roadmap must grow in 50-word batches');
assert.strictEqual(lexicon.filter((word) => word.quality === 'verified').length, 100, 'Expected 100 published words');
assert.strictEqual(lexicon.filter((word) => word.quality === 'reviewed').length, lexicon.length - 100, 'Unexpected reviewed word count');
assert.strictEqual(new Set(lexicon.map((word) => normalize(word.vi))).size, lexicon.length, 'Vocabulary roadmap contains duplicate lexical units');

domains.forEach(({ range: [start, end], name, required }) => {
  const batch = lexicon.filter((word) => word.rank >= start && word.rank <= end);
  assert.strictEqual(batch.length, 50, `${name} must contain 50 lexical units`);
  required.forEach((word) => assert.ok(byVietnamese.has(normalize(word)), `${name} is missing ${word}`));
});

lessonWordIds.forEach((id) => assert.ok(lexicon.some((word) => word.id === id), `Lesson references unknown word: ${id}`));
candidateWordIds.forEach((id) => {
  const word = lexicon.find((entry) => entry.id === id);
  assert.ok(word, `Candidate lesson references unknown word: ${id}`);
  assert.ok(['verified', 'reviewed'].includes(word.quality), `Candidate lesson bypasses the Core quality gate: ${id}`);
});

const reviewed = lexicon.filter((word) => word.quality === 'reviewed');
const archivedReviewed = reviewed.filter((word) => archiveRanks.has(normalize(word.vi)));
const archivedTop1000 = archivedReviewed.filter((word) => archiveRanks.get(normalize(word.vi)) <= 1000);
const linkedWords = lexicon.filter((word) => lessonWordIds.has(word.id));
const candidateLinkedWords = lexicon.filter((word) => candidateWordIds.has(word.id));
const reviewedCandidateLinkedWords = reviewed.filter((word) => candidateWordIds.has(word.id));
const combinedWordIds = new Set([...lessonWordIds, ...candidateWordIds]);
const combinedLinkedWords = lexicon.filter((word) => combinedWordIds.has(word.id));

assert.ok(archivedReviewed.length >= 150, 'Core 101–300 lost too much archived frequency evidence');
assert.ok(archivedTop1000.length >= 100, 'Core 101–300 must retain at least 100 archived top-1000 matches');
assert.strictEqual(combinedLinkedWords.filter((word) => word.rank <= 300).length, 300, 'Every Core 300 word must link to a published or candidate lesson');

console.log(JSON.stringify({
  lexicalUnits: lexicon.length,
  verified: lexicon.filter((word) => word.quality === 'verified').length,
  reviewed: reviewed.length,
  reviewedFoundInArchived3k: archivedReviewed.length,
  reviewedFoundInArchivedTop1000: archivedTop1000.length,
  linkedToPublishedLessons: linkedWords.length,
  lessonCoveragePercent: Number((linkedWords.length / lexicon.length * 100).toFixed(1)),
  reviewedLessonPacks: candidateLessonFiles.map((file) => file.replace('-lessons.json', '')),
  linkedToReviewedLessons: reviewedCandidateLinkedWords.length,
  linkedToCandidateLessons: candidateLinkedWords.length,
  combinedLessonCoverageAfterPromotion: combinedLinkedWords.length,
  combinedLessonCoveragePercentAfterPromotion: Number((combinedLinkedWords.length / lexicon.length * 100).toFixed(1)),
  domains: domains.map(({ range, name }) => ({ range: `${range[0]}-${range[1]}`, name, count: 50 })),
}, null, 2));
