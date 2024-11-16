const express = require('express');
const bodyParser = require('body-parser');
const { execFile } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

const framesDir = path.join(__dirname, 'frames');
const outputDir = path.join(__dirname, 'output');

if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

app.use(bodyParser.json({ limit: '50mb' }));

app.post('/render', async (req, res) => {
    const { frames, frameRate } = req.body;

    try {
        const videoId = uuidv4();
        const framePaths = await saveFrames(frames, videoId);

        const outputPath = path.join(outputDir, `${videoId}.mp4`);
        await generateVideo(framePaths, frameRate, outputPath);

        res.json({ videoUrl: `${process.env.BASE_URL || 'http://localhost:' + PORT}/output/${videoId}.mp4` });

        setTimeout(() => cleanup(videoId), 60000); // 60秒後に削除

    } catch (error) {
        console.error('Error during rendering:', error);
        res.status(500).send('Error occurred during video rendering.');
    }
});

app.use('/output', express.static(outputDir));

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

async function saveFrames(frames, videoId) {
    const framePaths = [];
    for (let i = 0; i < frames.length; i++) {
        const framePath = path.join(framesDir, `${videoId}_frame_${String(i).padStart(3, '0')}.png`);
        const base64Data = frames[i].replace(/^data:image\/png;base64,/, '');
        await fs.promises.writeFile(framePath, base64Data, 'base64');
        framePaths.push(framePath);
    }
    return framePaths;
}

function generateVideo(framePaths, frameRate, outputPath) {
    return new Promise((resolve, reject) => {
        const inputPattern = path.join(framesDir, framePaths[0].replace(/_\d+\.png$/, '_%03d.png'));
        const args = ['-r', frameRate, '-i', inputPattern, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', outputPath];

        execFile(ffmpeg, args, (error) => {
            if (error) return reject(error);
            resolve(outputPath);
        });
    });
}

async function cleanup(videoId) {
    const frameFiles = fs.readdirSync(framesDir).filter(file => file.startsWith(videoId));
    frameFiles.forEach(file => fs.unlinkSync(path.join(framesDir, file)));

    const outputFile = path.join(outputDir, `${videoId}.mp4`);
    if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
}
