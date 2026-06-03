const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let demoInterval = null;
let isPaused = false;
let isRunning = false;
let currentSpeed = 1;
let soundEnabled = true;
let audioContext = null;
let currentLevel = 1;
let totalScore = 0;
let lastScore = 0;
let lastLives = 3;
let selectedStartLevel = 1;

const LEVELS = {
    1: { name: 'NIVEL 1', rows: 5, cols: 8, ballSpeed: 1.0, paddleWidth: 100 },
    2: { name: 'NIVEL 2', rows: 6, cols: 8, ballSpeed: 1.3, paddleWidth: 85  },
    3: { name: 'NIVEL 3', rows: 7, cols: 8, ballSpeed: 1.6, paddleWidth: 70  }
};

// SONIDO
function initAudio() {
    try { audioContext = new (window.AudioContext || window.webkitAudioContext)(); }
    catch(e) { console.log('Web Audio API no soportada'); }
}

function playSound(type) {
    if (!soundEnabled || !audioContext) return;
    const o = audioContext.createOscillator();
    const g = audioContext.createGain();
    o.connect(g); g.connect(audioContext.destination);
    switch(type) {
        case 'hit':
            o.frequency.setValueAtTime(400, audioContext.currentTime);
            o.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.1);
            g.gain.setValueAtTime(0.3, audioContext.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            o.start(); o.stop(audioContext.currentTime + 0.1); break;
        case 'brick':
            o.frequency.setValueAtTime(600 + currentLevel * 100, audioContext.currentTime);
            o.frequency.exponentialRampToValueAtTime(800 + currentLevel * 100, audioContext.currentTime + 0.05);
            g.gain.setValueAtTime(0.25, audioContext.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            o.start(); o.stop(audioContext.currentTime + 0.1); break;
        case 'lose':
            o.frequency.setValueAtTime(200, audioContext.currentTime);
            o.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.3);
            g.gain.setValueAtTime(0.3, audioContext.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            o.start(); o.stop(audioContext.currentTime + 0.3); break;
        case 'levelup':
            [523,659,784,1047].forEach((freq,i) => {
                const osc = audioContext.createOscillator(), gain = audioContext.createGain();
                osc.connect(gain); gain.connect(audioContext.destination);
                osc.frequency.setValueAtTime(freq, audioContext.currentTime + i*0.15);
                gain.gain.setValueAtTime(0.2, audioContext.currentTime + i*0.15);
                gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i*0.15 + 0.3);
                osc.start(audioContext.currentTime + i*0.15);
                osc.stop(audioContext.currentTime + i*0.15 + 0.3);
            }); break;
        case 'victory':
            [523,659,784,880,1047,1175,1319,1568].forEach((freq,i) => {
                const osc = audioContext.createOscillator(), gain = audioContext.createGain();
                osc.connect(gain); gain.connect(audioContext.destination);
                osc.frequency.setValueAtTime(freq, audioContext.currentTime + i*0.1);
                gain.gain.setValueAtTime(0.2, audioContext.currentTime + i*0.1);
                gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i*0.1 + 0.2);
                osc.start(audioContext.currentTime + i*0.1);
                osc.stop(audioContext.currentTime + i*0.1 + 0.2);
            }); break;
    }
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('soundBtn');
    btn.textContent = soundEnabled ? '🔊' : '🔇';
    btn.classList.toggle('muted', !soundEnabled);
    if (soundEnabled && !audioContext) initAudio();
}

// CONTROLES
function setSpeed(speed) {
    currentSpeed = speed;
    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.speed) === speed);
    });
    if (isRunning && !isPaused) { clearInterval(demoInterval); runDemo(); }
}

function startAtLevel(level) {
    if (!audioContext) initAudio();
    selectedStartLevel = level; currentLevel = level;
    totalScore = 0; lastScore = 0; lastLives = 3;
    hideAllOverlays();
    startLevel(level);
}

function startDemo() {
    if (isRunning && !isPaused) return;
    if (!audioContext) initAudio();
    if (isPaused) { isPaused = false; runDemo(); updateControlButtons(); return; }
    showOverlay('startOverlay');
}

function startLevel(level) {
    currentLevel = level;
    fetch(`/api/start_demo?level=${level}`)
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                isRunning = true; isPaused = false;
                document.getElementById('liveBadge').classList.add('active');
                document.getElementById('levelBadge').textContent = LEVELS[level].name;
                document.getElementById('demoLevel').textContent = level;
                updateControlButtons();
                runDemo();
            }
        });
}

function pauseDemo() {
    if (!isRunning) return;
    isPaused = true; clearInterval(demoInterval); updateControlButtons();
}

function stopDemo() {
    isRunning = false; isPaused = false; clearInterval(demoInterval);
    document.getElementById('liveBadge').classList.remove('active');
    updateControlButtons(); showOverlay('startOverlay');
}

function updateControlButtons() {
    const playBtn = document.getElementById('playBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const stopBtn = document.getElementById('stopBtn');
    if (isRunning && !isPaused) {
        playBtn.innerHTML = '▶️ JUGANDO...'; playBtn.disabled = true;
        pauseBtn.disabled = false; stopBtn.disabled = false;
    } else if (isPaused) {
        playBtn.innerHTML = '▶️ REANUDAR'; playBtn.disabled = false;
        pauseBtn.disabled = true; stopBtn.disabled = false;
    } else {
        playBtn.innerHTML = '▶️ PLAY'; playBtn.disabled = false;
        pauseBtn.disabled = true; stopBtn.disabled = true;
    }
}

function runDemo() {
    const interval = Math.max(5, Math.floor(50 / currentSpeed));
    demoInterval = setInterval(fetchDemoStep, interval);
}

function fetchDemoStep() {
    fetch('/api/demo_step')
        .then(r => r.json())
        .then(data => {
            if (data.done) {
                handleGameEnd(data);
            } else {
                const gs = data.game_state;
                if (gs.score > lastScore) playSound('brick');
                if (gs.lives < lastLives) playSound('lose');
                lastScore = gs.score; lastLives = gs.lives;
                drawGame(gs);
                document.getElementById('demoScore').textContent = totalScore + gs.score;
                document.getElementById('demoLives').textContent = gs.lives;
            }
        });
}

function handleGameEnd(data) {
    clearInterval(demoInterval);
    const gs = data.game_state;
    const levelScore = gs ? gs.score : lastScore;
    const maxScore = LEVELS[currentLevel].rows * LEVELS[currentLevel].cols * 10;
    const victory = levelScore >= maxScore;
    totalScore += levelScore;
    if (victory) {
        if (currentLevel < 3) {
            playSound('levelup');
            document.getElementById('levelUpText').textContent = `Preparando Nivel ${currentLevel + 1}...`;
            showOverlay('levelUpOverlay');
            setTimeout(() => { hideAllOverlays(); startLevel(currentLevel + 1); }, 2000);
        } else {
            isRunning = false; playSound('victory');
            document.getElementById('liveBadge').classList.remove('active');
            document.getElementById('victoryText').textContent = `Score Total: ${totalScore} puntos`;
            showOverlay('victoryOverlay'); updateControlButtons();
        }
    } else {
        isRunning = false; playSound('lose');
        document.getElementById('liveBadge').classList.remove('active');
        document.getElementById('gameOverText').textContent = `Score Final: ${totalScore} | Nivel alcanzado: ${currentLevel}`;
        showOverlay('gameOverOverlay'); updateControlButtons();
    }
}

function hideAllOverlays() { document.querySelectorAll('.game-overlay').forEach(o => o.classList.remove('show')); }
function showOverlay(id) { hideAllOverlays(); document.getElementById(id).classList.add('show'); }
function toggleSidePanel() {
    const panel = document.getElementById('sidePanel');
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
}

// RENDERIZADO
function drawGame(gs) {
    const W = canvas.width, H = canvas.height;
    const gradient = ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,W);
    const bgColors = { 1:['#0a1628','#000'], 2:['#1a0a28','#0a0010'], 3:['#280a0a','#100000'] };
    gradient.addColorStop(0, bgColors[currentLevel][0]);
    gradient.addColorStop(1, bgColors[currentLevel][1]);
    ctx.fillStyle = gradient; ctx.fillRect(0,0,W,H);

    ctx.strokeStyle = 'rgba(0,240,255,0.02)'; ctx.lineWidth = 1;
    for (let x=0; x<W; x+=30) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y=0; y<H; y+=30) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.font = 'bold 120px Orbitron';
    ctx.textAlign = 'center'; ctx.fillText(currentLevel, W/2, H/2+40);

    const brickColors = [
        {fill:'#ff4757',glow:'rgba(255,71,87,0.6)'}, {fill:'#ff6b35',glow:'rgba(255,107,53,0.6)'},
        {fill:'#ffa502',glow:'rgba(255,165,2,0.6)'},  {fill:'#ffdd59',glow:'rgba(255,221,89,0.6)'},
        {fill:'#2ed573',glow:'rgba(46,213,115,0.6)'}, {fill:'#1e90ff',glow:'rgba(30,144,255,0.6)'},
        {fill:'#a55eea',glow:'rgba(165,94,234,0.6)'}
    ];

    gs.bricks.forEach(brick => {
        if (brick.active) {
            const c = brickColors[brick.row % brickColors.length];
            ctx.shadowColor = c.glow; ctx.shadowBlur = 12;
            ctx.fillStyle = c.fill; ctx.beginPath();
            ctx.roundRect(brick.x, brick.y, brick.width||58, brick.height||22, 5); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath();
            ctx.roundRect(brick.x+3, brick.y+3, (brick.width||58)-6, 7, 3); ctx.fill();
            ctx.shadowBlur = 0;
        }
    });

    const p = gs.paddle;
    ctx.shadowColor = 'rgba(0,240,255,0.8)'; ctx.shadowBlur = 25;
    const pg = ctx.createLinearGradient(p.x,p.y,p.x,p.y+p.height);
    pg.addColorStop(0,'#00f0ff'); pg.addColorStop(0.5,'#0088aa'); pg.addColorStop(1,'#004455');
    ctx.fillStyle = pg; ctx.beginPath();
    ctx.roundRect(p.x,p.y,p.width,p.height,8); ctx.fill();
    ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 2; ctx.stroke(); ctx.shadowBlur = 0;

    const b = gs.ball;
    ctx.shadowColor = 'rgba(255,0,255,0.9)'; ctx.shadowBlur = 20;
    const bg = ctx.createRadialGradient(b.x-3,b.y-3,0,b.x,b.y,b.radius);
    bg.addColorStop(0,'#ffffff'); bg.addColorStop(0.3,'#ff00ff'); bg.addColorStop(1,'#880088');
    ctx.fillStyle = bg; ctx.beginPath();
    ctx.arc(b.x,b.y,b.radius,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#ff66ff'; ctx.lineWidth = 2; ctx.stroke(); ctx.shadowBlur = 0;

    for (let i=0; i<gs.lives; i++) {
        ctx.shadowColor = 'rgba(255,71,87,0.5)'; ctx.shadowBlur = 10;
        ctx.fillStyle = '#ff4757'; ctx.beginPath();
        ctx.arc(30+i*35, H-25, 12, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
    }

    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '14px Orbitron';
    ctx.textAlign = 'right'; ctx.fillText(`NIVEL ${currentLevel}`, W-20, H-20);
}

// GRÁFICAS
function createCharts(data) {
    const episodes = data.rewards.map((_,i) => i+1);
    const opts = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: { grid: { color:'rgba(255,255,255,0.05)' }, ticks: { color:'rgba(255,255,255,0.4)', maxTicksLimit:5 } },
            y: { grid: { color:'rgba(255,255,255,0.05)' }, ticks: { color:'rgba(255,255,255,0.4)' } }
        }
    };
    new Chart(document.getElementById('rewardChart'),  { type:'line', data:{ labels:episodes, datasets:[{ data:data.rewards,  borderColor:'#e74c3c', backgroundColor:'rgba(231,76,60,0.1)',  fill:true, tension:0.4, borderWidth:2, pointRadius:0 }]}, options:opts });
    new Chart(document.getElementById('scoreChart'),   { type:'line', data:{ labels:episodes, datasets:[{ data:data.scores,   borderColor:'#3498db', backgroundColor:'rgba(52,152,219,0.1)', fill:true, tension:0.4, borderWidth:2, pointRadius:0 }]}, options:opts });
    new Chart(document.getElementById('epsilonChart'), { type:'line', data:{ labels:episodes, datasets:[{ data:data.epsilons, borderColor:'#9b59b6', backgroundColor:'rgba(155,89,182,0.1)', fill:true, tension:0.4, borderWidth:2, pointRadius:0 }]}, options:{ ...opts, scales:{ ...opts.scales, y:{ ...opts.scales.y, min:0, max:1.05 }}} });
    new Chart(document.getElementById('lossChart'),    { type:'line', data:{ labels:episodes, datasets:[{ data:data.losses,   borderColor:'#f39c12', backgroundColor:'rgba(243,156,18,0.1)', fill:true, tension:0.4, borderWidth:2, pointRadius:0 }]}, options:opts });
}

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', function() {
    showOverlay('startOverlay');
    fetch('/api/stats').then(r=>r.json()).then(stats => {
        document.getElementById('totalEpisodes').textContent = stats.total_episodes || 0;
        document.getElementById('bestScore').textContent = stats.best_score || 0;
        document.getElementById('victories').textContent = stats.victories || 0;
    }).catch(err => console.log('Error:', err));
    fetch('/api/training_data').then(r=>r.json()).then(data => {
        if (data.rewards && data.rewards.length > 0) createCharts(data);
    }).catch(err => console.log('Error:', err));
});

// Polyfill roundRect
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r) {
        if (w<2*r) r=w/2; if (h<2*r) r=h/2;
        this.moveTo(x+r,y); this.arcTo(x+w,y,x+w,y+h,r);
        this.arcTo(x+w,y+h,x,y+h,r); this.arcTo(x,y+h,x,y,r);
        this.arcTo(x,y,x+w,y,r); this.closePath();
    }
}