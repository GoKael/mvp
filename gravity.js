// Configuration
const CONFIG = {
    font: 'Outfit',
    fontSize: 80,
    padding: 100,
    snapDistance: 40,
    words: ['MOMENT', 'JOURNEY', 'IMACT', 'BALANCE', 'VIBRANT', 'GALAXY']
};

let engine, world;
let glyphs = [];
let currentWordIndex = 0;
let isWinning = false;

const container = document.getElementById('canvas-wrapper');
const statusMsg = document.getElementById('status-msg');

async function init() {
    // Setup Matter.js
    engine = Matter.Engine.create();
    world = engine.world;
    world.gravity.y = 1.2;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Custom Renderer
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // Walls
    const ground = Matter.Bodies.rectangle(width/2, height + 50, width, 100, { isStatic: true });
    const wallLeft = Matter.Bodies.rectangle(-25, height/2, 50, height, { isStatic: true });
    const wallRight = Matter.Bodies.rectangle(width + 25, height/2, 50, height, { isStatic: true });
    Matter.World.add(world, [ground, wallLeft, wallRight]);

    // Mouse control
    const mouse = Matter.Mouse.create(canvas);
    const mouseConstraint = Matter.MouseConstraint.create(engine, {
        mouse: mouse,
        constraint: {
            stiffness: 0.1,
            render: { visible: false }
        }
    });
    Matter.World.add(world, mouseConstraint);

    // Initial word
    await loadWord(CONFIG.words[currentWordIndex]);

    // Game loop
    const update = () => {
        Matter.Engine.update(engine, 1000 / 60);
        draw(ctx, width, height);
        checkWin();
        requestAnimationFrame(update);
    };
    update();

    // Events
    window.addEventListener('resize', () => {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    });

    document.getElementById('reset-btn').addEventListener('click', scramble);
    document.getElementById('next-btn').addEventListener('click', nextWord);
}

async function loadWord(text) {
    // Remove old glyphs
    glyphs.forEach(g => Matter.World.remove(world, g.body));
    glyphs = [];
    isWinning = false;
    statusMsg.style.opacity = 0;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const centerX = width / 2;
    const centerY = height / 2;

    // Layout Logic
    const canvasCtx = document.createElement('canvas').getContext('2d');
    canvasCtx.font = `900 ${CONFIG.fontSize}px ${CONFIG.font}`;
    
    // Attempt Pretext but fallback to Canvas MeasureText
    let usePretext = false;
    try {
        const pretext = await import('https://cdn.jsdelivr.net/npm/@chenglou/pretext/dist/index.js');
        if (pretext && pretext.prepare) usePretext = true;
    } catch (e) {
        console.warn("Pretext CDN failed, using Canvas fallback.");
    }

    // Calculate total width for centering
    let totalWidth = 0;
    const charWidths = [];
    for (const char of text) {
        const w = canvasCtx.measureText(char).width;
        charWidths.push(w);
        totalWidth += w + 10;
    }

    let currentX = centerX - totalWidth / 2;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const w = charWidths[i];
        const h = CONFIG.fontSize * 0.7;

        const targetX = currentX + w / 2;
        const targetY = centerY;

        // Scrambled initial position
        const startX = targetX + (Math.random() - 0.5) * 200;
        const startY = height * 0.2 + (Math.random() - 0.5) * 100;

        const body = Matter.Bodies.rectangle(startX, startY, w, h, {
            chamfer: { radius: 4 },
            friction: 0.1,
            restitution: 0.5,
            render: { fillStyle: '#ffffff' }
        });

        // Slight random rotation for the drop
        Matter.Body.setAngle(body, (Math.random() - 0.5) * 0.5);

        glyphs.push({
            char,
            body,
            targetX,
            targetY,
            width: w,
            height: h,
            isSnapped: false
        });

        Matter.World.add(world, body);
        currentX += w + 10;
    }
}

function scramble() {
    glyphs.forEach(g => {
        g.isSnapped = false;
        Matter.Body.setStatic(g.body, false);
        Matter.Body.applyForce(g.body, g.body.position, {
            x: (Math.random() - 0.5) * 0.1,
            y: -Math.random() * 0.2
        });
    });
}

function nextWord() {
    currentWordIndex = (currentWordIndex + 1) % CONFIG.words.length;
    loadWord(CONFIG.words[currentWordIndex]);
}

function checkWin() {
    if (isWinning) return;

    let allSnapped = true;
    glyphs.forEach(g => {
        const dx = g.body.position.x - g.targetX;
        const dy = g.body.position.y - g.targetY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONFIG.snapDistance && !g.isSnapped) {
            // Snap to target
            g.isSnapped = true;
            Matter.Body.setPosition(g.body, { x: g.targetX, y: g.targetY });
            Matter.Body.setAngle(g.body, 0);
            Matter.Body.setStatic(g.body, true);
        }

        if (!g.isSnapped) allSnapped = false;
    });

    if (allSnapped && glyphs.length > 0) {
        isWinning = true;
        statusMsg.innerText = "Word Complete!";
        statusMsg.style.opacity = 1;
        setTimeout(nextWord, 2000);
    }
}

function draw(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);

    // Draw Target Zones (dashed outlines)
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    glyphs.forEach(g => {
        ctx.strokeRect(g.targetX - g.width / 2, g.targetY - g.height / 2, g.width, g.height);
    });
    ctx.setLineDash([]);

    // Draw Glyphs
    ctx.font = `900 ${CONFIG.fontSize}px Outfit`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    glyphs.forEach(g => {
        const { x, y } = g.body.position;
        const angle = g.body.angle;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        // Glow effect if snapped
        if (g.isSnapped) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#fbbf24';
            ctx.fillStyle = '#fbbf24';
        } else {
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#ffffff';
        }

        ctx.fillText(g.char, 0, 0);
        ctx.restore();
    });
}

// Start
init();
