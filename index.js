const express = require('express');
const bodyParser = require('body-parser');
const { execFile } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors'); // CORSミドルウェアを読み込み

const app = express();
const PORT = process.env.PORT || 3000;

const framesDir = path.join(__dirname, 'frames');
const outputDir = path.join(__dirname, 'output');

if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

// CORSミドルウェアを適用
app.use(cors({
    origin: 'https://mojiil.com', // 必要なオリジンを指定
    methods: 'GET,POST,OPTIONS',
    allowedHeaders: 'Content-Type'
}));

// body-parserのサイズ制限を200MBに設定
app.use(bodyParser.json({ limit: '200mb' }));
app.use(bodyParser.urlencoded({ limit: '200mb', extended: true }));

app.post('/render', (req, res) => {
    const { frames, frameRate } = req.body;
    const videoId = uuidv4();

    // 非同期的に動画生成を開始
    processVideo(frames, frameRate, videoId)
        .then(() => {
            console.log(`Video ${videoId} processing completed`);
        })
        .catch(err => {
            console.error(`Error processing video ${videoId}:`, err);
        });

    // クライアントにはすぐにレスポンスを返す
    res.json({ message: 'Video processing started', videoId });
});

// 非同期処理をバックエンドで行う関数
async function processVideo(frames, frameRate, videoId) {
    const framePaths = await saveFrames(frames, videoId);
    const outputPath = path.join(outputDir, `${videoId}.mp4`);
    await generateVideo(framePaths, frameRate, outputPath);
    setTimeout(() => cleanup(videoId), 60000); // 60秒後に出力ファイルとフレームを削除
}

// フレームを保存する関数
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

// 動画を生成する関数
function generateVideo(framePaths, frameRate, outputPath) {
    return new Promise((resolve, reject) => {
        // 修正: パスの組み立てを修正
        const inputPattern = path.join(framesDir, path.basename(framePaths[0]).replace(/_\d+\.png$/, '_%03d.png'));
        const args = ['-r', frameRate, '-i', inputPattern, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', outputPath];

        execFile(ffmpeg, args, (error) => {
            if (error) return reject(error);
            resolve(outputPath);
        });
    });
}

// 不要なファイルを削除する関数
async function cleanup(videoId) {
    const frameFiles = fs.readdirSync(framesDir).filter(file => file.startsWith(videoId));
    frameFiles.forEach(file => fs.unlinkSync(path.join(framesDir, file)));

    const outputFile = path.join(outputDir, `${videoId}.mp4`);
    if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
}

app.use('/output', express.static(outputDir));

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
