import { STATUS, loadState, saveState, setWordStatus } from './lib/app-core.mjs';

const answer = document.getElementById('answer');
const tiles = document.getElementById('tiles');
const meaning = document.getElementById('meaning');
const message = document.getElementById('message');

let words = [];
let state;
let currentIndex = 0;
let chosen = [];

function shuffled(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function currentWord() {
  return words[currentIndex % words.length];
}

function render() {
  const word = currentWord();
  if (!word) return;
  chosen = [];
  meaning.textContent = `${word.zhTW} · ${word.pos}`;
  message.textContent = '';
  answer.innerHTML = [...word.vi].map(() => '<span></span>').join('');
  tiles.innerHTML = shuffled([...word.vi].map((character, index) => ({ character, index })))
    .map((item) => `<button type="button" data-index="${item.index}">${item.character}</button>`).join('');
}

tiles.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const word = currentWord();
  const character = button.textContent;
  const expected = [...word.vi][chosen.length];
  if (character !== expected) {
    message.textContent = '順序不對，再看一次中文提示。';
    return;
  }
  chosen.push(character);
  answer.children[chosen.length - 1].textContent = character;
  button.disabled = true;
  message.textContent = '';
  if (chosen.join('') === word.vi) {
    setWordStatus(state, word.id, STATUS.LEARNING);
    saveState(localStorage, state);
    message.textContent = '完成！這個字已加入學習清單。';
  }
});

document.getElementById('reset').addEventListener('click', render);
document.getElementById('next').addEventListener('click', () => {
  currentIndex = (currentIndex + 1) % words.length;
  render();
});

fetch('server/data/core-100.json')
  .then((response) => response.json())
  .then((items) => {
    words = items.filter((word) => !word.vi.includes(' ') && [...word.vi].length >= 2 && [...word.vi].length <= 8);
    state = loadState(localStorage, items);
    render();
  })
  .catch(() => { meaning.textContent = '目前無法載入正式單字。'; });
