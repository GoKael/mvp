// Initialization
const Graph = ForceGraph()(document.getElementById('graph'));

function updateGraph() {
  fetch('http://localhost:3000/api/graph-data')
    .then(res => res.json())
    .then(data => {
      Graph.graphData(data)
           .nodeAutoColorBy('group')
           .nodeCanvasObject((node, ctx, globalScale) => {
             const label = node.id;
             const fontSize = 14/globalScale;
             ctx.font = `${fontSize}px Sans-Serif`;
             const textWidth = ctx.measureText(label).width;

             ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
             ctx.beginPath(); ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI, false); ctx.fill();

             ctx.textAlign = 'center';
             ctx.textBaseline = 'middle';
             ctx.fillStyle = node.color || '#fff';
             ctx.fillText(label, node.x, node.y + 10);
           })
           .onNodeClick(node => {
             const panel = document.getElementById('info-panel');
             panel.style.display = 'block';
             document.getElementById('node-title').innerText = node.id;
             document.getElementById('node-desc').innerText = `Source: ${node.title || 'Manual Entry'}`;
             document.getElementById('node-meta').innerText = `Type: ${node.type} ${node.hanViet ? ' | Hán-Việt: ' + node.hanViet : ''}`;
           })
           .linkColor(() => '#444')
           .backgroundColor('#0b0e14');
    });
}

// Initial Load
updateGraph();

// Refresh every 5 seconds for live updates
setInterval(updateGraph, 5000);

window.addEventListener('resize', () => Graph.width(window.innerWidth).height(window.innerHeight));

window.addEventListener('resize', () => Graph.width(window.innerWidth).height(window.innerHeight));
