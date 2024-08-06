const express = require('express');
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');

const app = express();
const port = 3000;

// AWS S3 configuration
const s3Client = new S3Client({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: '',
        secretAccessKey: '',
    },
});

app.use(cors());
app.use(bodyParser.json());

app.post('/clone', async (req, res) => {
    const { githubUrl, projectType } = req.body;

    if (!githubUrl || !projectType) {
        return res.status(400).json({ error: 'GitHub URL and project type are required' });
    }

    // Extract the repository name from the URL
    const repoName = githubUrl.split('/').pop().replace('.git', '');
    const repoDir = path.join(__dirname, 'repos', repoName);
    const bucketName = 'testerbucket-hyperverge'; // Replace with your bucket name
    const s3FolderPath = repoName; // Use repoName as folder in S3

    try {
        // Ensure the repos directory exists
        fs.mkdirSync(path.join(__dirname, 'repos'), { recursive: true });

        // Clone the repository
        console.log(`Cloning the repository from ${githubUrl} into ${repoDir}`);
        await simpleGit().clone(githubUrl, repoDir);
        console.log('Repository cloned successfully.');

        // Upload folder to S3
        const uploadFolderToS3 = async (dir, s3Path) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const filePath = path.join(dir, file);
                const fileS3Path = path.join(s3Path, file).replace(/\\/g, '/'); // Use forward slashes for S3 paths

                if (fs.statSync(filePath).isDirectory()) {
                    // Recursively upload directories
                    await uploadFolderToS3(filePath, fileS3Path);
                } else {
                    const fileContent = fs.readFileSync(filePath);
                    const contentType = mime.lookup(filePath) || 'application/octet-stream'; // Determine MIME type

                    const command = new PutObjectCommand({
                        Bucket: bucketName,
                        Key: fileS3Path,
                        Body: fileContent,
                        ACL: 'public-read',
                        ContentType: contentType // Set MIME type
                    });

                    console.log(`Uploading ${fileS3Path} to S3 bucket ${bucketName} with Content-Type ${contentType}`);
                    await s3Client.send(command);
                }
            }
        };

        await uploadFolderToS3(repoDir, s3FolderPath);

        // Provide URL for the main file (index.html)
        const s3Url = `https://${bucketName}.s3.ap-south-1.amazonaws.com/${s3FolderPath}/index.html`;
        res.json({ url: s3Url });

    } catch (error) {
        console.error('Error during deployment:', error);
        res.status(500).json({ error: 'Failed to deploy the project', details: error.message });
    } finally {
        // Cleanup the cloned repo directory
        if (fs.existsSync(repoDir)) {
            fs.rmSync(repoDir, { recursive: true, force: true });
        }
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
