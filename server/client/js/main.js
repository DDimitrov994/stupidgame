// Updated main.js
import { Circle } from './circle.js';

const socket = io(window.location.origin);
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let circles = [];
let dragging = false;
let sourceCircle = null;
let movingDots = [];
// Prefetch and cache images
const preloadedImages = {};

function preloadImages() {
    const imageSources = {
        player1: '/assets/player1Circle.png',
        player2: '/assets/player2Circle.png',
        neutral: '/assets/neutralCircle.png',
    };

    for (const [key, src] of Object.entries(imageSources)) {
        const img = new Image();
        img.src = src;
        preloadedImages[key] = img;
    }
}

preloadImages(); // Call this at the beginning of the game

// Function to generate a unique player ID
function generatePlayerId() {
    return `player_${Math.random().toString(36).substr(2, 9)}`;
}

// Initialize player data
let playerData = {
    id: localStorage.getItem('playerId') || generatePlayerId(),
    name: localStorage.getItem('playerName') || 'Player',
    selectedImage: localStorage.getItem('playerImage') || '/assets/player1Circle.png',
};

// Save player data to local storage
localStorage.setItem('playerId', playerData.id);
localStorage.setItem('playerName', playerData.name);
localStorage.setItem('playerImage', playerData.selectedImage);

// Prefill the form fields with stored values
document.getElementById('player-name').value = playerData.name;
document.getElementById('player-image').value = playerData.selectedImage;

// Update player data when fields change
document.getElementById('player-name').addEventListener('input', (e) => {
    playerData.name = e.target.value || 'Player';
    localStorage.setItem('playerName', playerData.name);
});

document.getElementById('player-image').addEventListener('change', (e) => {
    playerData.selectedImage = e.target.value;
    localStorage.setItem('playerImage', playerData.selectedImage);
});

// Matchmaking and game initialization
document.getElementById('find-game').addEventListener('click', () => {
    document.getElementById('game-menu').style.display = 'none';
    document.getElementById('loading-screen').style.display = 'block';

    socket.emit('find_game', playerData);

    socket.on('match_found', () => {
        console.log('Match found! Waiting for game updates...');
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('gameCanvas').style.display = 'block';
    });

   // Modify socket.on('update_game') to assign image keys
socket.on('update_game', (gameState) => {
    circles = gameState.circles.map((circle) => {
        const isCurrentPlayer = circle.playerId === playerData.id;
        const imageKey =
            circle.playerId === playerData.id
                ? 'player1'
                : circle.playerId
                ? 'player2'
                : 'neutral';
        return new Circle(
            circle.id,
            circle.x,
            circle.y,
            circle.units,
            circle.isPlayer,
            circle.player || '',
            circle.color || 'gray',
            circle.playerId,
            imageKey // Use imageKey for preloaded images
        );
    });

    movingDots = gameState.movingDots.map((dot) => {
        const source = circles.find((c) => c.id === dot.sourceId);
        const target = circles.find((c) => c.id === dot.targetId);

        if (!source || !target) {
            console.error(`Source or target not found for dot:`, dot);
        }

        return {
            ...dot,
            source,
            target,
            offsetX: dot.offsetX || 0,
            offsetY: dot.offsetY || 0,
        };
    });
});


    socket.on('game_over', (data) => {
        alert(`Game Over! Winner: ${data.winner}`);
        window.location.reload();
    });
});

canvas.addEventListener('mousedown', (e) => {
    const { offsetX, offsetY } = e;

    sourceCircle = circles.find((circle) => {
        const dx = circle.x - offsetX;
        const dy = circle.y - offsetY;
        return (
            Math.sqrt(dx * dx + dy * dy) < 40 &&
            circle.isPlayer &&
            circle.playerId === playerData.id
        );
    });

    if (sourceCircle) {
        dragging = true;
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (dragging && sourceCircle) {
        const { offsetX, offsetY } = e;

        const targetCircle = circles.find((circle) => {
            const dx = circle.x - offsetX;
            const dy = circle.y - offsetY;
            return Math.sqrt(dx * dx + dy * dy) < 40 && circle !== sourceCircle;
        });

        if (targetCircle) {
            sendAttack(sourceCircle, targetCircle, sourceCircle.units);
        }
    }

    dragging = false;
    sourceCircle = null;
});

function sendAttack(sourceCircle, targetCircle, units) {
    if (!sourceCircle || !targetCircle) return;

    if (units > 0) {
        socket.emit('player_action', {
            type: 'attack',
            playerId: playerData.id,
            source: sourceCircle.id,
            target: targetCircle.id,
            units,
        });
    }
}

function renderMovingDots() {
    movingDots.forEach((dot) => {
        const { source, target, progress, offsetX, offsetY } = dot;

        if (source && target) {
            const adjustedProgress = Math.max(progress - dot.waveProgress, 0);

            const x = source.x + (target.x - source.x) * Math.min(1, adjustedProgress) + offsetX;
            const y = source.y + (target.y - source.y) * Math.min(1, adjustedProgress) + offsetY;

            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = dot.color || 'white';
            ctx.fill();
        }
    });
}
function gameLoop(ctx, circles, deltaTime) {
    // Update and draw all circles
    circles.forEach((circle) => {
        circle.update(deltaTime);
        circle.draw(ctx, preloadedImages); // Pass preloaded images
    });
}

function renderBackground() {
    ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
}

let lastTime = 0;
function loop(timestamp) {
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    // Render background
    renderBackground();
    // Render circles and dots
    gameLoop(ctx, circles, deltaTime);
    renderMovingDots();
    requestAnimationFrame(loop);
}

backgroundImage.onload = () => {
    console.log('Background image loaded!');
    requestAnimationFrame(loop);
};
