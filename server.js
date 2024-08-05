// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const AWS = require('aws-sdk');
const simpleGit = require('simple-git');

const app = express();
app.use(express.json());

// Configure AWS
AWS.config.update({ region: 'your-region' });
const s3 = new AWS.S3();
const BUCKET_NAME = 'your-s3-static-hosting-bucket';

app.post('/api/clone', async (req, res) => {
  const { url } = req.body;
  const repoName = path.basename(url, '.git');
  const tempDir = path.join(__dirname, repoName);

  try {
    await simpleGit().clone(url, tempDir);
    console.log(`Repository ${repoName} cloned to ${tempDir}`);

    const uploadDir = async (dir) => {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        const filePath = path.join(dir, file);
        const fileKey = path.join(repoName, file);

        if (fs.lstatSync(filePath).isDirectory()) {
          await uploadDir(filePath);
        } else {
          const fileContent = fs.readFileSync(filePath);

          const params = {
            Bucket: BUCKET_NAME,
            Key: fileKey,
            Body: fileContent,
            ACL: 'public-read',
          };

          await s3.upload(params).promise();
          console.log(`Uploaded ${fileKey} to S3`);
        }
      }
    };

    await uploadDir(tempDir);
    fs.rmSync(tempDir, { recursive: true, force: true });

    const hostedUrl = `http://${BUCKET_NAME}.s3-website-your-region.amazonaws.com/${repoName}/index.html`;
    res.send(`Repository hosted at: ${hostedUrl}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('An error occurred');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
