// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { getHanViet } = require('./utils/han-viet-logic');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

// Persistent Vault State
const fs = require('fs');
const path = require('path');
let vault = {};
try {
  const lrDataPath = path.join(__dirname, 'data', 'lr_8k.json');
  if (fs.existsSync(lrDataPath)) {
    const rawData = fs.readFileSync(lrDataPath, 'utf8');
    vault = JSON.parse(rawData);
    console.log(`Loaded ${Object.keys(vault).length} words from LR 8k dictionary.`);
  }
} catch (e) {
  console.error("Failed to load LR 8K dictionary", e);
}

let graphData = {
  nodes: [
    { id: 'Candidate', group: 1, type: 'English' },
    { id: '候選人', group: 2, type: 'Chinese' },
    { id: 'Ứng cử viên', group: 3, type: 'Vietnamese', isHanViet: true },
    { id: 'tuần', group: 1, type: 'Vietnamese', mastered: false },
    { id: 'năm', group: 1, type: 'Vietnamese', mastered: false },
    { id: 'thời gian', group: 1, type: 'Vietnamese', mastered: false },
    { id: 'công việc', group: 1, type: 'Vietnamese', mastered: false },
    { id: 'hôm nay', group: 1, type: 'Vietnamese', mastered: false },
    { id: 'ngày mai', group: 1, type: 'Vietnamese', mastered: false },
    { id: 'Thứ Hai', group: 1, type: 'Vietnamese', mastered: false },
    { id: 'Chủ Nhật', group: 1, type: 'Vietnamese', mastered: false },
    { id: 'Time & Calendar', group: 4, type: 'Theme' },
    { id: 'Work & Life', group: 4, type: 'Theme' },
    { id: 'báo chí', group: 1, type: 'Vietnamese', mastered: false },
    { id: 'đọc', group: 1, type: 'Vietnamese', mastered: false },
    { id: 'Media', group: 4, type: 'Theme' }
  ],
  links: [
    { source: 'Candidate', target: '候選人' },
    { source: '候選人', target: 'Ứng cử viên' },
    { source: 'tuần', target: 'Time & Calendar' },
    { source: 'năm', target: 'Time & Calendar' },
    { source: 'hôm nay', target: 'Time & Calendar' },
    { source: 'ngày mai', target: 'Time & Calendar' },
    { source: 'thời gian', target: 'Time & Calendar' },
    { source: 'công việc', target: 'Work & Life' },
    { source: 'báo chí', target: 'Media' },
    { source: 'đọc', target: 'Media' },
    { source: 'Media', target: 'Work & Life' }
  ]
};

// API: Save word from Extension
app.post('/api/save-word', (req, res) => {
  const { text, title, url } = req.body;
  const normalizedText = (text || '').trim();
  if (!normalizedText) {
    res.status(400).json({ success: false, error: 'text is required' });
    return;
  }
  let hv = getHanViet(normalizedText) || '';
  
  // Add to vault if not exists
  if (!vault[normalizedText]) {
    vault[normalizedText] = { word: normalizedText, hv: hv, status: 0, trans: 'New Word', type: 'Unknown', source: title };
  }

  // Update Graph
  if (!graphData.nodes.find(n => n.id === normalizedText)) {
    graphData.nodes.push({ id: normalizedText, group: 1, type: 'Captured', hanViet: hv, status: 0 });
    if (!graphData.nodes.find(n => n.id === title)) {
      graphData.nodes.push({ id: title, group: 4, type: 'Video' });
    }
    graphData.links.push({ source: normalizedText, target: title });
  }

  res.json({ success: true, vault: vault[normalizedText], hanViet: hv });
});

// API: Update Status (from Memory)
app.post('/api/update-status', (req, res) => {
  const { word, status } = req.body;
  if (vault[word]) {
    vault[word].status = status;
    // Update graph node as well
    const node = graphData.nodes.find(n => n.id === word);
    if (node) node.status = status;
    
    // Persist to json
    fs.writeFile(path.join(__dirname, 'data', 'lr_8k.json'), JSON.stringify(vault, null, 2), (err) => {
      if (err) console.error("Error writing Vault API json:", err);
    });
    
    res.json({ success: true });
  } else {
    res.json({ success: false, error: 'Word not in vault' });
  }
});

app.get('/api/vault', (req, res) => res.json(vault));
app.get('/api/graph-data', (req, res) => res.json(graphData));

app.listen(PORT, () => {
  console.log(`Knowledge Graph Backend running at http://localhost:${PORT}`);
});
