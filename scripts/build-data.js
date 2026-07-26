#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FOOD_SOURCE = path.join(ROOT, 'content/food-30.source.json');
const CORE_RELEASES = path.join(ROOT, 'content/core-releases.json');

function coreCandidateRanges() {
  return fs.readdirSync(path.join(ROOT, 'content'))
    .map((file) => /^core-(\d+)-(\d+)\.source\.json$/.exec(file))
    .filter(Boolean)
    .map((match) => `${match[1]}-${match[2]}`)
    .sort((left, right) => Number(left.split('-')[0]) - Number(right.split('-')[0]));
}

const zhMeaning = [
  '是', '和、以及', '的、屬於', '有、擁有', '不、沒有', '在…裡、之中', '一、一個', '各、複數標記',
  '給、為了、讓', '得到、可以', '和、與', '人', '在、居住', '已經（過去／完成標記）', '但是', '必須、對',
  '做、工作', '到、抵達', '回、關於', '當…時', '就、則', '出、出來', '進、進入', '上、上去', '去、走',
  '知道、會', '想要', '看見、感覺', '說', '個（物品量詞）', '這、這個', '那、那個', '哪、哪個',
  '哪裡', '誰', '什麼', '每、每個', '新、剛、才', '家、房子', '人生、世代', '爺爺、先生',
  '奶奶／外婆、女士', '哥哥、你（年長男性）', '姊姊、你（年長女性）', '弟妹、你（年幼者）',
  '孩子、動物量詞', '天、日', '年', '月', '小時、現在', '頭、開頭', '頭髮', '臉、表面', '眼睛', '耳朵',
  '鼻子', '嘴巴', '牙齒', '手、手臂', '腳、腿', '背部', '肚子', '藥', '檢查、看診', '疾病', '痛、疼',
  '累、疲倦', '市場、菜市場', '學校', '海、海邊', '山', '房間', '廚房、爐灶', '吃', '喝', '睡覺',
  '跑', '學習', '玩', '笑', '哭', '漂亮', '醜、壞', '好', '大', '小', '長', '短', '高', '低', '桌子',
  '椅子', '櫃子', '床', '刀', '剪刀', '筆', '筆記本、作業本', '紙', '機器、設備',
];

const posMap = {
  'Verb': '動詞',
  'Conj.': '連接詞',
  'Prep.': '介系詞',
  'Adverb': '副詞',
  'Adv.': '副詞',
  'Det.': '限定詞',
  'Num.': '數詞',
  'Pronoun': '代名詞',
  'Adj': '形容詞',
  'Noun': '名詞',
  'Cl.': '量詞',
  'Verb/Prep.': '動詞／介系詞',
  'Verb/Adv.': '動詞／副詞',
  'Adj/Adv': '形容詞／副詞',
  'Noun/Adj': '名詞／形容詞',
};

const focusWords = [
  [['牛肉河粉', 'phở bò'], ['熱', 'nóng'], ['早上', 'buổi sáng']],
  [['滴漏咖啡', 'cà phê phin'], ['一滴一滴', 'từng giọt'], ['很慢', 'rất chậm']],
  [['我們', 'chúng ta'], ['什錦火鍋', 'lẩu thập cẩm'], ['週末', 'cuối tuần']],
  [['法國麵包', 'bánh mì'], ['酥脆', 'giòn'], ['太好吃', 'ngon quá']],
  [['生春捲', 'gỏi cuốn'], ['蝦', 'tôm'], ['很多蔬菜', 'nhiều rau']],
  [['烤肉米線', 'bún chả'], ['沾醬', 'nước chấm'], ['酸甜', 'chua ngọt'], ['適中', 'vừa ăn']],
  [['給我', 'cho tôi'], ['一杯', 'một ly'], ['冰茶', 'trà đá'], ['少糖', 'ít đường']],
  [['這道甜湯', 'món chè này'], ['太甜', 'ngọt quá'], ['吃不下', 'không ăn được']],
  [['烤排骨碎米飯', 'cơm tấm sườn nướng'], ['特色美食', 'món ăn đặc trưng'], ['西貢', 'Sài Gòn']],
  [['順化牛肉麵', 'bún bò Huế'], ['辛辣', 'cay nồng'], ['特色', 'đặc trưng']],
  [['魚露', 'nước mắm'], ['靈魂', 'linh hồn'], ['越南美食', 'ẩm thực Việt Nam']],
  [['粽子', 'bánh chưng'], ['包', 'gói'], ['冬葉', 'lá dong']],
  [['想喝', 'muốn uống'], ['一杯', 'một ly'], ['酪梨奶昔', 'sinh tố bơ']],
  [['大蒜炒空心菜', 'rau muống xào tỏi'], ['香氣四溢', 'thơm phức']],
  [['金邊粿條', 'hủ tiếu Nam Vang'], ['很有名', 'rất nổi tiếng']],
  [['越南煎餅', 'bánh xèo'], ['煎的時候', 'khi chiên'], ['滋滋聲', 'xèo xèo']],
  [['熱豬雜粥', 'cháo lòng nóng'], ['下雨天', 'ngày mưa'], ['太棒了', 'rất tuyệt']],
  [['粉卷', 'bánh cuốn'], ['薄薄的', 'tráng mỏng'], ['配著吃', 'ăn kèm'], ['扎肉', 'chả lụa']],
  [['鱧魚酸湯', 'canh chua cá lóc'], ['鳳梨', 'thơm'], ['番茄', 'cà chua']],
  [['烤肉串', 'nem lụi'], ['烤', 'nướng'], ['紅炭爐', 'bếp than hồng']],
  [['炙魚膾', 'chả cá Lã Vọng'], ['配著吃', 'ăn kèm'], ['蒔蘿', 'thì là'], ['青蔥', 'hành lá']],
  [['椰子水', 'nước dừa'], ['清甜涼爽', 'ngọt mát'], ['自然', 'tự nhiên']],
  [['木鱉果糯米飯', 'xôi gấc'], ['紅色', 'màu đỏ'], ['很漂亮', 'rất đẹp']],
  [['蟹膏米線', 'bún riêu cua'], ['清甜', 'ngọt thanh'], ['蟹膏', 'gạch cua']],
  [['砂鍋燉肉', 'thịt kho tộ'], ['燉', 'kho'], ['土鍋', 'nồi đất']],
  [['小孩子', 'trẻ em'], ['喜歡吃', 'thích ăn'], ['麵包夾冰淇淋', 'bánh mì kẹp kem']],
  [['湯圓', 'chè trôi nước'], ['配著吃', 'ăn với'], ['薑糖水', 'nước đường gừng']],
  [['泡麵', 'mì tôm'], ['救飢', 'cứu đói'], ['半夜', 'nửa đêm']],
  [['甕仔雞', 'gà nướng lu'], ['皮脆', 'da giòn'], ['肉嫩', 'thịt mềm']],
  [['黑糯米優格', 'sữa chua nếp cẩm'], ['又酸又甜', 'vừa chua vừa ngọt']],
];

const sentenceBreakdowns = [
  [['主詞', 'Tôi', '我'], ['動作', 'thích ăn', '喜歡吃'], ['核心', 'phở bò nóng', '熱牛肉河粉'], ['時間', 'vào buổi sáng', '在早上']],
  [['主題', 'Cà phê phin', '滴漏咖啡'], ['動作', 'nhỏ', '滴下來'], ['方式', 'từng giọt một', '一滴一滴'], ['狀態', 'rất chậm', '很慢']],
  [['主詞', 'Chúng ta', '我們'], ['動作', 'ăn', '吃'], ['核心', 'lẩu thập cẩm', '什錦火鍋'], ['時間', 'vào cuối tuần', '在週末']],
  [['主題', 'Bánh mì này', '這個法國麵包'], ['描述', 'giòn', '酥脆'], ['連接', 'và', '而且'], ['感受', 'ngon quá', '太好吃']],
  [['主題', 'Gỏi cuốn', '生春捲'], ['動作', 'có', '有'], ['內容', 'tôm, thịt', '蝦和肉'], ['內容', 'nhiều rau', '很多蔬菜']],
  [['主題', 'Nước chấm bún chả', '烤肉米線的沾醬'], ['動作', 'có vị', '味道是'], ['核心', 'chua ngọt', '酸甜'], ['狀態', 'vừa ăn', '適中']],
  [['動作', 'Cho', '給'], ['對象', 'tôi', '我'], ['核心', 'một ly trà đá', '一杯冰茶'], ['需求', 'ít đường', '少糖']],
  [['主題', 'Món chè này', '這個甜湯'], ['狀態', 'ngọt quá', '太甜'], ['主詞', 'tôi', '我'], ['結果', 'không ăn được', '吃不下']],
  [['主題', 'Cơm tấm sườn nướng', '烤排骨碎米飯'], ['判斷', 'là', '是'], ['核心', 'món ăn đặc trưng', '特色美食'], ['地點', 'Sài Gòn', '西貢']],
  [['主題', 'Bún bò Huế', '順化牛肉麵'], ['動作', 'có vị', '帶有味道'], ['核心', 'cay nồng', '辛辣'], ['特色', 'đặc trưng', '獨特']],
  [['主題', 'Nước mắm', '魚露'], ['判斷', 'là', '是'], ['核心', 'linh hồn', '靈魂'], ['範圍', 'ẩm thực Việt Nam', '越南美食']],
  [['主題', 'Bánh chưng', '粽子'], ['動作', 'gói', '包'], ['方式', 'bằng', '使用'], ['核心', 'lá dong', '冬葉']],
  [['主詞', 'Tôi', '我'], ['意願', 'muốn uống', '想喝'], ['數量', 'một ly', '一杯'], ['核心', 'sinh tố bơ', '酪梨奶昔']],
  [['主題', 'Rau muống xào tỏi', '大蒜炒空心菜'], ['描述', 'thơm phức', '香氣四溢']],
  [['主題', 'Hủ tiếu Nam Vang', '金邊粿條'], ['狀態', 'rất nổi tiếng', '非常有名']],
  [['主題', 'Bánh xèo', '越南煎餅'], ['時間', 'khi chiên', '煎的時候'], ['動作', 'có tiếng kêu', '發出聲音'], ['聲音', 'xèo xèo', '滋滋聲']],
  [['動作', 'Ăn', '吃'], ['核心', 'cháo lòng nóng', '熱豬雜粥'], ['時間', 'vào ngày mưa', '在下雨天'], ['感受', 'rất tuyệt', '太棒了']],
  [['主題', 'Bánh cuốn', '粉卷'], ['描述', 'tráng mỏng', '薄薄的'], ['動作', 'ăn kèm', '配著吃'], ['核心', 'chả lụa', '扎肉']],
  [['主題', 'Canh chua cá lóc', '鱧魚酸湯'], ['動作', 'nấu với', '和…一起煮'], ['材料', 'thơm', '鳳梨'], ['材料', 'cà chua', '番茄']],
  [['主題', 'Nem lụi', '烤肉串'], ['動作', 'nướng', '烤'], ['地點', 'trên bếp than hồng', '在紅炭爐上']],
  [['主題', 'Chả cá Lã Vọng', '炙魚膾'], ['動作', 'ăn kèm với', '配著吃'], ['核心', 'thì là', '蒔蘿'], ['核心', 'hành lá', '青蔥']],
  [['主題', 'Nước dừa', '椰子水'], ['描述', 'ngọt mát', '清甜涼爽'], ['狀態', 'tự nhiên', '自然']],
  [['主題', 'Xôi gấc', '木鱉果糯米飯'], ['動作', 'có', '有'], ['核心', 'màu đỏ', '紅色'], ['狀態', 'rất đẹp', '很漂亮']],
  [['主題', 'Bún riêu cua', '蟹膏米線'], ['動作', 'có vị', '帶有味道'], ['核心', 'ngọt thanh', '清甜'], ['來源', 'từ gạch cua', '來自蟹膏']],
  [['主題', 'Thịt kho tộ', '砂鍋燉肉'], ['動作', 'được kho', '被燉煮'], ['地點', 'trong nồi đất', '在土鍋裡']],
  [['主詞', 'Trẻ em', '小孩子'], ['動作', 'thích ăn', '喜歡吃'], ['核心', 'bánh mì kẹp kem', '麵包夾冰淇淋']],
  [['主題', 'Chè trôi nước', '湯圓'], ['動作', 'ăn với', '配著吃'], ['核心', 'nước đường gừng', '薑糖水']],
  [['主題', 'Mì tôm', '泡麵'], ['判斷', 'là', '是'], ['核心', 'món ăn cứu đói', '救飢的美食'], ['時間', 'lúc nửa đêm', '半夜']],
  [['主題', 'Gà nướng lu', '甕仔雞'], ['動作', 'có', '有'], ['描述', 'da giòn', '皮脆'], ['描述', 'thịt mềm', '肉嫩']],
  [['主題', 'Sữa chua nếp cẩm', '黑糯米優格'], ['句型', 'vừa chua vừa ngọt', '又酸又甜']],
];

const sentenceFixes = {
  2: {
    zhTW: '滴漏咖啡一滴一滴慢慢滴下來。',
    vi: 'Cà phê phin nhỏ từng giọt một, rất chậm.',
  },
  6: {
    zhTW: '烤肉米線的沾醬酸甜適中。',
    vi: 'Nước chấm bún chả có vị chua ngọt vừa ăn.',
  },
  9: {
    zhTW: '烤排骨碎米飯是西貢的特色美食。',
    vi: 'Cơm tấm sườn nướng là món ăn đặc trưng của Sài Gòn.',
  },
  23: {
    zhTW: '木鱉果糯米飯有很漂亮的紅色。',
    vi: 'Xôi gấc có màu đỏ rất đẹp.',
  },
  29: {
    zhTW: '甕仔雞皮脆肉嫩。',
    vi: 'Gà nướng lu có da giòn, thịt mềm.',
  },
};

const exampleOverrides = {
  7: [
    ['Cho tôi xin một cốc nước lọc.', '請給我一杯白開水。'],
    ['Đó chỉ là một sự tình cờ.', '那只是一個巧合。'],
    ['Anh ấy là một giáo viên giỏi.', '他是一位好老師。'],
  ],
  20: [
    ['Khi còn nhỏ, tôi rất nghịch.', '小時候我很調皮。'],
    ['Khi nào bạn rảnh thì gọi tôi.', '你有空的時候打給我。'],
    ['Khi ra về, nhớ khóa cửa.', '離開時記得鎖門。'],
  ],
  22: [
    ['Hãy đi ra ngoài hít thở không khí.', '出去呼吸一下新鮮空氣吧。'],
    ['Mặt trời ló ra sau đám mây.', '太陽從雲後露了出來。'],
    ['Bạn đã tìm ra chìa khóa chưa?', '你找到鑰匙了嗎？'],
  ],
  23: [
    ['Mời bạn vào trong nhà chơi.', '請進屋坐坐。'],
    ['Anh ấy vừa vào làm ở công ty này.', '他剛進這家公司工作。'],
    ['Đừng đi vào lối đó.', '別走進那條路。'],
  ],
  39: [
    ['Nhà tôi ở gần công viên.', '我家在公園附近。'],
    ['Bạn có ở nhà không?', '你在家嗎？'],
    ['Nhà là nơi ấm áp nhất.', '家是最溫暖的地方。'],
  ],
  40: [
    ['Cuộc đời thật lắm bất ngờ.', '人生充滿了驚喜。'],
    ['Đời người ngắn ngủi lắm.', '人生苦短。'],
    ['Đời sống hiện đại thay đổi rất nhanh.', '現代生活變化得很快。'],
  ],
  55: [
    ['Tai tôi hơi bị ù.', '我的耳朵有點耳鳴。'],
    ['Đừng để lời tôi nói vào tai này rồi lọt ra tai kia.', '別把我說的話當成左耳進右耳出。'],
    ['Anh ấy có đôi tai rất thính.', '他的聽力很靈敏。'],
  ],
  57: [
    ['Hãy ngậm miệng lại.', '請閉上嘴巴。'],
    ['Khuôn miệng cô ấy rất xinh.', '她的嘴型很漂亮。'],
    ['Anh ấy chỉ hứa bằng miệng.', '他只是口頭答應。'],
  ],
  62: [
    ['Tôi bị đau bụng.', '我肚子痛。'],
    ['Đừng để bụng đói.', '別餓著肚子。'],
    ['Bụng tôi đang réo vì đói.', '我的肚子餓得咕咕叫。'],
  ],
  65: [
    ['Anh ấy đang mắc bệnh nặng.', '他得了重病。'],
    ['Bệnh này rất dễ lây.', '這種病很容易傳染。'],
    ['Phòng bệnh hơn chữa bệnh.', '預防勝於治療。'],
  ],
  73: [
    ['Mẹ đang nấu cơm trong bếp.', '媽媽正在廚房煮飯。'],
    ['Căn bếp rất ấm cúng.', '廚房很溫馨。'],
    ['Tôi thích tự vào bếp nấu ăn.', '我喜歡親自下廚。'],
  ],
  75: [
    ['Tôi muốn uống một chút nước.', '我想喝一點水。'],
    ['Đừng uống nhiều rượu.', '別喝太多酒。'],
    ['Tôi thích uống nước cam.', '我喜歡喝柳橙汁。'],
  ],
  87: [
    ['Con đường dài dằng dặc.', '這條路很漫長。'],
    ['Mái tóc dài mượt.', '她有柔順的長髮。'],
    ['Câu chuyện này hơi dài.', '這個故事有點長。'],
  ],
  90: [
    ['Cái bàn này hơi thấp.', '這張桌子有點低。'],
    ['Mức giá này thấp hơn tôi nghĩ.', '這個價格比我想像中低。'],
    ['Nhiệt độ xuống thấp.', '溫度下降了。'],
  ],
  91: [
    ['Chiếc bàn này đặt cạnh cửa sổ.', '這張桌子放在窗邊。'],
    ['Tôi để sách lên bàn.', '我把書放在桌上。'],
    ['Chúng tôi ngồi quanh bàn ăn.', '我們圍著餐桌坐。'],
  ],
  92: [
    ['Mời bạn ngồi xuống ghế.', '請坐到椅子上。'],
    ['Chiếc ghế này rất thoải mái.', '這張椅子很舒服。'],
    ['Trong phòng còn một chiếc ghế trống.', '房間裡還有一張空椅子。'],
  ],
  93: [
    ['Quần áo được cất trong tủ.', '衣服收在櫃子裡。'],
    ['Chiếc tủ này làm bằng gỗ.', '這個櫃子是木製的。'],
    ['Tôi để chìa khóa trong ngăn tủ.', '我把鑰匙放在櫃子的抽屜裡。'],
  ],
  94: [
    ['Tôi nằm trên giường đọc sách.', '我躺在床上看書。'],
    ['Chiếc giường này rất êm.', '這張床很柔軟。'],
    ['Bé đang ngủ trên giường.', '孩子正在床上睡覺。'],
  ],
  95: [
    ['Đây là con dao dùng để thái rau.', '這是用來切菜的刀。'],
    ['Con dao này rất sắc.', '這把刀很鋒利。'],
    ['Tôi cần một con dao để cắt trái cây.', '我需要一把刀來切水果。'],
  ],
  96: [
    ['Cho tôi mượn cái kéo.', '請借我剪刀。'],
    ['Cái kéo này dùng để cắt giấy.', '這把剪刀是用來剪紙的。'],
    ['Cẩn thận, mũi kéo rất nhọn.', '小心，剪刀尖很銳利。'],
  ],
  97: [
    ['Tôi viết tên bằng bút mực.', '我用原子筆寫名字。'],
    ['Cây bút này hết mực rồi.', '這支筆沒墨水了。'],
    ['Bạn có thể cho tôi mượn bút không?', '你可以借我一支筆嗎？'],
  ],
  98: [
    ['Tôi ghi từ mới vào vở.', '我把新單字寫進筆記本。'],
    ['Quyển vở này là của em tôi.', '這本筆記本是我弟弟的。'],
    ['Học sinh mở vở ra làm bài.', '學生打開作業本寫題目。'],
  ],
  99: [
    ['Tôi cần một tờ giấy trắng.', '我需要一張白紙。'],
    ['Hãy viết địa chỉ lên giấy.', '請把地址寫在紙上。'],
    ['Trên bàn có một xấp giấy.', '桌上有一疊紙。'],
  ],
  100: [
    ['Cái máy này đang hoạt động.', '這台機器正在運轉。'],
    ['Tôi chưa biết cách dùng máy.', '我還不知道怎麼使用這台機器。'],
    ['Kỹ thuật viên đang sửa máy.', '技術人員正在修理機器。'],
  ],
};

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function writeJson(target, value) {
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalize(value) {
  return slugify(value).replace(/-/g, ' ');
}

function buildCoreSeed() {
  const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/archive/lr_1k.json'), 'utf8'));
  const translations = new Map(
    JSON.parse(fs.readFileSync(path.join(ROOT, 'content/core-100-examples.zhTW.json'), 'utf8'))
      .map((item) => [item.rank, item.zhTW]),
  );
  const rows = Object.values(source).sort((a, b) => a.rank - b.rank).slice(0, 100);
  if (rows.length !== 100 || zhMeaning.length !== 100) throw new Error('Core 100 source mismatch');

  return rows.map((item, index) => {
    const slug = slugify(item.word);
    const rank = index + 1;
    const prefix = `${String(rank).padStart(3, '0')}-${slug}`;
    const translated = translations.get(rank);
    const sourceExamples = exampleOverrides[rank]
      || (item.examples || []).slice(0, 3).map((example, exampleIndex) => [example.v || example.vi, translated?.[exampleIndex]]);
    const examples = sourceExamples.map((example, exampleIndex) => ({
      vi: String(example[0] || '').trim(),
      zhTW: String(example[1] || '').trim(),
      audio: {
        vi: `assets/audio/examples/${String(rank).padStart(3, '0')}-${exampleIndex + 1}.mp3`,
        zhTW: `assets/audio/examples/${String(rank).padStart(3, '0')}-${exampleIndex + 1}-zh.mp3`,
      },
    }));
    if (examples.length !== 3 || examples.some((example) => !example.vi || !example.zhTW)) {
      throw new Error(`Core word ${item.word} is missing bilingual examples`);
    }
    return {
      id: `vi:${prefix}`,
      conceptId: `concept:${String(rank).padStart(3, '0')}`,
      vi: item.word,
      zhTW: zhMeaning[index],
      pos: posMap[item.type] || item.type,
      hanViet: '',
      rank,
      audio: {
        vi: `assets/audio/words/${prefix}.mp3`,
        zhTW: `assets/audio/words/${prefix}-zh.mp3`,
      },
      examples,
      quality: 'verified',
    };
  });
}

function buildReleasedWords(range) {
  const source = JSON.parse(fs.readFileSync(path.join(ROOT, `content/core-${range}.source.json`), 'utf8'));
  return source.map((word) => {
    if (word.quality !== 'reviewed') throw new Error(`Released source must remain reviewed: ${word.vi}`);
    const prefix = `${String(word.rank).padStart(3, '0')}-${slugify(word.vi)}`;
    return {
      id: `vi:${prefix}`,
      conceptId: `concept:${String(word.rank).padStart(3, '0')}`,
      vi: word.vi,
      zhTW: word.zhTW,
      pos: word.pos,
      hanViet: '',
      rank: word.rank,
      audio: {
        vi: `assets/audio/words/${prefix}.mp3`,
        zhTW: `assets/audio/words/${prefix}-zh.mp3`,
      },
      examples: word.examples.map((example, index) => ({
        ...example,
        audio: {
          vi: `assets/audio/examples/${String(word.rank).padStart(3, '0')}-${index + 1}.mp3`,
          zhTW: `assets/audio/examples/${String(word.rank).padStart(3, '0')}-${index + 1}-zh.mp3`,
        },
      })),
      quality: 'verified',
    };
  });
}

function buildCoreWords() {
  const releases = JSON.parse(fs.readFileSync(CORE_RELEASES, 'utf8'));
  const words = buildCoreSeed();
  let expectedStart = 101;
  releases.forEach((range) => {
    const match = /^(\d+)-(\d+)$/.exec(range);
    if (!match) throw new Error(`Invalid Core release range: ${range}`);
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (start !== expectedStart || end !== start + 49 || end > 2000) throw new Error(`Core releases must be contiguous 50-word batches: ${range}`);
    words.push(...buildReleasedWords(range));
    expectedStart = end + 1;
  });
  return words;
}

function buildLexiconWords(coreWords) {
  const byRank = new Map(coreWords.map((word) => [word.rank, word]));
  coreCandidateRanges().forEach((range) => {
    buildReleasedWords(range).forEach((word) => {
      if (!byRank.has(word.rank)) byRank.set(word.rank, { ...word, quality: 'reviewed' });
    });
  });
  return [...byRank.values()].sort((left, right) => left.rank - right.rank);
}

function parseFoodSource() {
  const items = JSON.parse(fs.readFileSync(FOOD_SOURCE, 'utf8'));
  if (items.length !== 30) throw new Error(`Expected 30 food sentences, found ${items.length}`);
  return items;
}

function buildLessons(coreWords) {
  const raw = parseFoodSource();
  const tokenIndex = coreWords.map((word) => ({ id: word.id, token: normalize(word.vi) }));
  const segments = raw.map((item, index) => {
    const id = index + 1;
    const [viTitle, zhTitle = ''] = String(item.food).match(/^(.*?)\s*\((.*?)\)$/)?.slice(1) || [item.food, ''];
    const fixed = sentenceFixes[id] || {};
    const vi = String(fixed.vi || item.vn).replace(/。/g, '.').trim();
    const zhTW = String(fixed.zhTW || item.tw).trim();
    const focus = focusWords[index].map(([zh, phrase]) => ({ zhTW: zh, vi: phrase }));
    const breakdown = sentenceBreakdowns[index].map(([role, phrase, zh]) => ({ role, vi: phrase, zhTW: zh }));
    focus.forEach((entry) => {
      if (!normalize(vi).includes(normalize(entry.vi))) {
        throw new Error(`Focus phrase "${entry.vi}" is absent from sentence ${id}: ${vi}`);
      }
    });
    breakdown.forEach((entry) => {
      if (!normalize(vi).includes(normalize(entry.vi))) {
        throw new Error(`Sentence part "${entry.vi}" is absent from sentence ${id}: ${vi}`);
      }
    });
    const normalizedSentence = ` ${normalize(vi)} `;
    const wordIds = tokenIndex
      .filter(({ token }) => token && normalizedSentence.includes(` ${token} `))
      .map(({ id: wordId }) => wordId);

    return {
      sourceId: id,
      topic: { vi: viTitle.trim(), zhTW: zhTitle.trim() },
      zhTW,
      vi,
      wordIds,
      focusWords: focus,
      breakdown,
    };
  });

  return Array.from({ length: 10 }, (_, lessonIndex) => {
    const lessonNumber = lessonIndex + 1;
    const group = segments.slice(lessonIndex * 3, lessonIndex * 3 + 3);
    const lessonId = `food-${String(lessonNumber).padStart(3, '0')}`;
    return {
      id: lessonId,
      category: 'food',
      title: {
        vi: group.map((segment) => segment.topic.vi).join(' · '),
        zhTW: group.map((segment) => segment.topic.zhTW).join('、'),
      },
      durationSec: 30,
      status: 'published',
      segments: group.map((segment, segmentIndex) => ({
        id: segmentIndex + 1,
        topic: segment.topic,
        zhTW: segment.zhTW,
        vi: segment.vi,
        wordIds: segment.wordIds,
        focusWords: segment.focusWords,
        breakdown: segment.breakdown,
        audio: {
          zhTW: `assets/audio/lessons/${lessonId}-${segmentIndex + 1}-zh.mp3`,
          vi: `assets/audio/lessons/${lessonId}-${segmentIndex + 1}-vi.mp3`,
        },
      })),
    };
  });
}

function buildPatterns() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'content/patterns.source.json'), 'utf8'))
    .map((pattern) => ({
      ...pattern,
      title: pattern.title.normalize('NFC'),
      summary: pattern.summary.normalize('NFC'),
      examples: pattern.examples.map((example, index) => ({
        vi: example.vi.normalize('NFC'),
        zhTW: example.zhTW.normalize('NFC'),
        audio: `assets/audio/patterns/pattern-${pattern.id}-${String(index + 1).padStart(2, '0')}-vi.mp3`,
      })),
    }));
}

function buildAudioJobs(coreWords, lexiconWords, lessons, patterns) {
  const jobs = [];
  coreWords.forEach((word) => {
    const wordAudio = typeof word.audio === 'string' ? { vi: word.audio } : word.audio;
    jobs.push({ kind: 'word', languageCode: 'vi-VN', voice: 'Zephyr', text: word.vi, output: wordAudio.vi });
    if (wordAudio.zhTW) jobs.push({ kind: 'word', languageCode: 'cmn-TW', voice: 'Zephyr', text: word.zhTW, output: wordAudio.zhTW });
    word.examples.forEach((example) => {
      const exampleAudio = typeof example.audio === 'string' ? { vi: example.audio } : example.audio;
      jobs.push({ kind: 'example', languageCode: 'vi-VN', voice: 'Zephyr', text: example.vi, output: exampleAudio.vi });
      if (exampleAudio.zhTW) jobs.push({ kind: 'example', languageCode: 'cmn-TW', voice: 'Zephyr', text: example.zhTW, output: exampleAudio.zhTW });
    });
  });
  lexiconWords.filter((word) => word.quality === 'reviewed').forEach((word) => {
    jobs.push({ kind: 'word', languageCode: 'cmn-TW', voice: 'Zephyr', text: word.zhTW, output: word.audio.zhTW });
    word.examples.forEach((example) => {
      jobs.push({ kind: 'example', languageCode: 'cmn-TW', voice: 'Zephyr', text: example.zhTW, output: example.audio.zhTW });
    });
  });
  lessons.forEach((lesson) => lesson.segments.forEach((segment) => {
    jobs.push({
      kind: 'lesson',
      languageCode: 'cmn-TW',
      voice: 'Zephyr',
      text: segment.zhTW,
      output: segment.audio.zhTW,
    });
    jobs.push({
      kind: 'lesson',
      languageCode: 'vi-VN',
      voice: 'Zephyr',
      text: segment.vi,
      output: segment.audio.vi,
    });
  }));
  patterns.forEach((pattern) => pattern.examples.forEach((example) => {
    jobs.push({
      kind: 'pattern',
      languageCode: 'vi-VN',
      voice: 'Zephyr',
      text: example.vi,
      output: example.audio,
    });
  }));
  return jobs;
}

function renderReviewMarkdown(lessons) {
  const lines = [
    '# 越南美食 30 句',
    '',
    '- 每支 Short：3 句，共 30 秒。',
    '- 正式執行來源：`server/data/lessons.json`。',
    '- 本檔只供人工校對，不由瀏覽器直接解析。',
    '',
  ];
  lessons.forEach((lesson) => {
    lines.push(`## ${lesson.id}｜${lesson.title.zhTW}`, '');
    lesson.segments.forEach((segment) => {
      lines.push(
        `### ${segment.topic.vi}（${segment.topic.zhTW}）`,
        '',
        `- 中文：${segment.zhTW}`,
        `- 越南文：${segment.vi}`,
        `- 單字：${segment.focusWords.map((word) => `${word.zhTW}／${word.vi}`).join('、')}`,
        '',
      );
    });
  });
  return `${lines.join('\n').trim()}\n`;
}

function main() {
  const coreWords = buildCoreWords();
  const lexiconWords = buildLexiconWords(coreWords);
  const lessons = buildLessons(coreWords);
  const patterns = buildPatterns();
  const audioJobs = buildAudioJobs(coreWords, lexiconWords, lessons, patterns);
  writeJson(path.join(ROOT, 'server/data/core-100.json'), coreWords.slice(0, 100));
  writeJson(path.join(ROOT, 'server/data/core.json'), coreWords);
  writeJson(path.join(ROOT, 'server/data/lexicon.json'), lexiconWords);
  writeJson(path.join(ROOT, 'server/data/lessons.json'), lessons);
  writeJson(path.join(ROOT, 'server/data/patterns.json'), patterns);
  writeJson(path.join(ROOT, 'server/data/audio-jobs.json'), audioJobs);
  writeJson(path.join(ROOT, 'server/data/audio-manifest.json'), {
    model: 'gemini-2.5-pro-tts',
    expected: audioJobs.length,
    assets: audioJobs.map((job) => ({ ...job, generated: fs.existsSync(path.join(ROOT, job.output)) })),
  });

  const contentDir = path.join(ROOT, 'content');
  ensureDir(contentDir);
  fs.writeFileSync(path.join(contentDir, 'short_30_script.md'), renderReviewMarkdown(lessons));
  console.log(`Built ${coreWords.length} published words, ${lexiconWords.length} dictionary entries, ${lessons.length} lessons, ${patterns.length} patterns, ${audioJobs.length} audio jobs.`);
}

main();
