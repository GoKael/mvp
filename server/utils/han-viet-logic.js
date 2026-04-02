// utils/han-viet-logic.js

const hanVietDict = {
  '注': 'Chú',
  '意': 'Ý',
  '力': 'Lực',
  '候': 'Hậu',
  '選': 'Tuyển',
  '人': 'Nhân',
  '研': 'Nghiên',
  '究': 'Cứu',
  '學': 'Học',
  '習': 'Tập',
  '發': 'Phát',
  '音': 'Âm',
  '應': 'Ứng',
  '用': 'Dụng'
};

/**
 * Convert a Chinese string to Hán-Việt (Sino-Vietnamese)
 * @param {string} chineseStr 
 * @returns {string} 
 */
function getHanViet(chineseStr) {
  return chineseStr.split('').map(char => hanVietDict[char] || '?').join(' ');
}

module.exports = { getHanViet };
