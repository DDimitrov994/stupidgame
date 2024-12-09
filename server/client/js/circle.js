// Updated circle.js
export class Circle {
    constructor(id, x, y, units, isPlayer = false, playerName = '', color = 'gray', playerId = null, imageSrc = '') {
        this.id = id;
        this.x = x;
        this.y = y;
        this.units = units;
        this.isPlayer = isPlayer;
        this.playerName = playerName;
        this.color = color;
        this.playerId = playerId;
        this.unitTimer = 0;
        this.image = new Image();
        this.image.src = imageSrc; // Set the source of the image
    }

    draw(ctx) {
        // Draw the circle image
        if (this.image.complete) {
            ctx.drawImage(this.image, this.x - 40, this.y - 40, 80, 80); // Adjust for circle radius (40)
        } else {
            // Fallback: draw a circle if the image is not loaded
            ctx.beginPath();
            ctx.arc(this.x, this.y, 40, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.stroke();
        }

        // Draw the unit count
        ctx.fillStyle = 'white';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.units, this.x, this.y + 6);

        // Draw the player name above the circle
        if (this.isPlayer) {
            ctx.fillText(this.playerName, this.x, this.y - 50);
        }
    }

    update(deltaTime) {
        if (this.isPlayer) {
            this.unitTimer += deltaTime;
            if (this.unitTimer >= 1) {
                this.units += 1;
                this.unitTimer = 0;
            }
        }
    }
}