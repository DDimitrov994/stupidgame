export class MovingDot {
    constructor(x, y, target, color, playerName = '') {
        this.x = x;
        this.y = y;
        this.target = target;
        this.speed = 2; // Movement speed
        this.color = color; // Dot's color
        this.playerName = playerName;

        // Random spread for clustering
        const angle = Math.random() * Math.PI * 2;
        const spread = Math.random() * 15; // Spread range
        this.offsetX = Math.cos(angle) * spread;
        this.offsetY = Math.sin(angle) * spread;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = this.color; // Use the color passed to the dot
        ctx.fill();
    }

    update() {
        const dx = this.target.x + this.offsetX - this.x;
        const dy = this.target.y + this.offsetY - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance < 5) {
            // Reached the target
            if (this.target.isPlayer) {
                this.target.mergeUnits(1);
            } else {
                this.target.receiveAttack(1, this.color, this.playerName);
            }
            return true;
        }

        // Normalize direction and move
        const nx = dx / distance;
        const ny = dy / distance;
        this.x += nx * this.speed;
        this.y += ny * this.speed;

        return false;
    }
}
