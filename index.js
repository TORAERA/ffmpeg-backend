const express = require('express');
const bodyParser = require('body-parser');
const { execFile } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors'); // CORSミドルウェアを読み込み

const app = express();
const PORT = process.env.PORT || 10000; // Render環境ではPORTが設定される

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

app.post('/render', async (req, res) => {
    const { frames, frameRate } = req.body;
    const videoId = uuidv4();

    try {
        // 動画生成プロセスを非同期で実行
        await processVideo(frames, frameRate, videoId);
        console.log(`Video ${videoId} processing completed`);

        // 動画生成完了後にフルURLをレスポンスとして返す
        res.json({
            message: 'Video processing completed',
            videoUrl: `https://${req.headers.host}/output/${videoId}.mp4` // フルURLを構築
        });
    } catch (err) {
        console.error(`Error processing video ${videoId}:`, err);
        res.status(500).json({ error: 'Video processing failed' });
    }
});

// 非同期処理をバックエンドで行う関数
async function processVideo(frames, frameRate, videoId) {
    const framePaths = await saveFrames(frames, videoId);
    const outputPath = path.join(outputDir, `${videoId}.mp4`);
    await generateVideo(framePaths, frameRate, outputPath);
    // setTimeout(() => cleanup(videoId), 60000); // 60秒後に出力ファイルとフレームを削除
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
        const inputPattern = path.join(framesDir, path.basename(framePaths[0]).replace(/_\d+\.png$/, '_%03d.png'));
        
        // 解像度とフレームレートを元に戻す
        const args = [
            '-r', frameRate,        // 元のフレームレートを使用
            '-i', inputPattern,
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-y', 
            outputPath
        ];

        execFile(ffmpeg, args, (error) => {
            if (error) {
                console.error('FFmpeg error:', error.message);
                return reject(error);
            }
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

// 静的ホスティング
app.use('/output', express.static(outputDir));

// デバッグ用エンドポイント
app.get('/check-output', (req, res) => {
    fs.readdir(outputDir, (err, files) => {
        if (err) {
            return res.status(500).send('Error reading output directory');
        }
        res.json({ files });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
