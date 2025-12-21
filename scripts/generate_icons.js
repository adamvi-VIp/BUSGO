const JimpModule = require('jimp');
const path = require('path');

// Handle different import styles (CommonJS vs ESM interop)
const Jimp = JimpModule.Jimp || JimpModule;

async function generateIcons() {
    const assetsDir = path.join(__dirname, '../busgo/src/assets');
    const inputFile = path.join(assetsDir, 'busstationbox.png');

    console.log(`Loading base icon from: ${inputFile}`);

    if (typeof Jimp.read !== 'function') {
        console.error('Jimp.read is not a function. Keys:', Object.keys(Jimp));
        return;
    }

    try {
        const image = await Jimp.read(inputFile);
        image.resize({ w: 48, h: 48 });

        const colors = {
            'tram': '#B91D47',
            'train': '#35b1a51f', // Note: this hex with alpha might behave unexpectedly in parseInt if 8 digits
            'ferry': '#0288D1',
            'trolleybus': '#7B1FA2',
            'night': '#808080',
            'bus': '#007bff' // Adding 'bus' explicitly if needed, or default logic handles it? existing logic replaces blueish
        };

        // Re-verify 'train' color hex: '#35b1a51f'. 
        // parseInt will take '35' as R if we stick to slice(1,3).
        // Standard hex is #RRGGBB. If 8 chars, #RRGGBBAA.
        // Existing code: r = slice(1,3), g = slice(3,5), b = slice(5,7). It ignores alpha or assumes 6 chars.
        // Ensure colors are 6 chars for this mapping logic or handle 8.

        // Fixed colors for safety:
        const safeColors = {
            'tram': '#B91D47',
            'train': '#35b1a5', // Removed alpha for consistent coloring
            'ferry': '#0288D1',
            'trolleybus': '#7B1FA2',
            'night': '#808080'
        };

        for (const [type, hex] of Object.entries(safeColors)) {
            const icon = image.clone();

            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);

            icon.scan(0, 0, icon.bitmap.width, icon.bitmap.height, function (x, y, idx) {
                const pr = this.bitmap.data[idx];
                const pg = this.bitmap.data[idx + 1];
                const pb = this.bitmap.data[idx + 2];
                const pa = this.bitmap.data[idx + 3];

                if (pa < 10) return;

                const isBlueish = pb > pr + 40 && pb > pg - 50;
                const isWhiteOrGray = pr > 180 && pg > 180 && pb > 180;

                if (isBlueish && !isWhiteOrGray) {
                    this.bitmap.data[idx] = r;
                    this.bitmap.data[idx + 1] = g;
                    this.bitmap.data[idx + 2] = b;
                }
            });

            const outFile = path.join(assetsDir, `${type}-icon.png`);
            if (icon.writeAsync) {
                await icon.writeAsync(outFile);
            } else {
                icon.write(outFile);
            }
            console.log(`Generated ${outFile}`);

            // --- Generate Dimmed Version ---
            const dimmedIcon = icon.clone();

            // Create a 48x48 black image with opacity
            // Jimp 0.x style: new Jimp(48, 48, 0x00000000, ...)
            // We can just scan and darken pixels (multiply by 0.55?) or composite a black overlay.
            // Darkening approach:
            dimmedIcon.scan(0, 0, dimmedIcon.bitmap.width, dimmedIcon.bitmap.height, function (x, y, idx) {
                // To simulate "black 45% opacity overlay":
                // Result = Source * (1 - 0.45) + Black * 0.45 = Source * 0.55
                // Only affect RGB, keep Alpha
                this.bitmap.data[idx] = Math.floor(this.bitmap.data[idx] * 0.55);
                this.bitmap.data[idx + 1] = Math.floor(this.bitmap.data[idx + 1] * 0.55);
                this.bitmap.data[idx + 2] = Math.floor(this.bitmap.data[idx + 2] * 0.55);
            });

            const outDimmed = path.join(assetsDir, `${type}-icon-dimmed.png`);
            if (dimmedIcon.writeAsync) {
                await dimmedIcon.writeAsync(outDimmed);
            } else {
                dimmedIcon.write(outDimmed);
            }
            console.log(`Generated ${outDimmed}`);
        }

        // Also generate bus-icon-dimmed.png from original (blue)
        const busIcon = image.clone();
        // Since original is blue, just darken it
        busIcon.scan(0, 0, busIcon.bitmap.width, busIcon.bitmap.height, function (x, y, idx) {
            this.bitmap.data[idx] = Math.floor(this.bitmap.data[idx] * 0.55);
            this.bitmap.data[idx + 1] = Math.floor(this.bitmap.data[idx + 1] * 0.55);
            this.bitmap.data[idx + 2] = Math.floor(this.bitmap.data[idx + 2] * 0.55);
        });
        const busOutDimmed = path.join(assetsDir, 'bus-icon-dimmed.png');
        if (busIcon.writeAsync) {
            await busIcon.writeAsync(busOutDimmed);
        } else {
            busIcon.write(busOutDimmed);
        }
        console.log(`Generated ${busOutDimmed}`);

        // Generate normal bus-icon.png if it doesn't exist (it is used in MapGL but might be mapped to busstationbox?)
        // MapGL uses 'bus-icon' -> busStationBoxIcon (which is imported from busstationbox.png)
        // So we don't strictly need `bus-icon.png` unless we want to standardize.
        // Let's create it for consistency if we want.
        const busOut = path.join(assetsDir, 'bus-icon.png');
        if (image.writeAsync) {
            await image.writeAsync(busOut);
        } else {
            image.write(busOut);
        }
        console.log(`Generated ${busOut}`);


    } catch (err) {
        console.error('Error processing icons:', err);
    }
}

generateIcons();
