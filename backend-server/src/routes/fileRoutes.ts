import { Router, Request, Response } from 'express';
import multer from 'multer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from '../config/r2';
import { authenticateToken } from '../middleware/authMiddleware';
import logger from '../utils/logger';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

const router = Router();

router.use(authenticateToken);

/**
 * POST /api/files/upload
 * Body: multipart/form-data  field: file, optional: chatId
 * Returns: { url, fileName, fileSize, fileType }
 */
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file provided' });
      return;
    }

    const chatId = (req.body?.chatId as string | undefined) ?? 'misc';
    // sanitize chatId to prevent path traversal
    const safeChatId = chatId.replace(/[^a-zA-Z0-9-_]/g, '');

    const ext = req.file.originalname.split('.').pop() ?? 'bin';
    const key = `chats/${safeChatId}/${uuidv4()}.${ext}`;

    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        ContentDisposition: `inline; filename="${req.file.originalname}"`,
      }),
    );

    const url = `${R2_PUBLIC_URL}/${key}`;
    res.json({
      success: true,
      data: {
        url,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileType: req.file.mimetype,
      },
    });
  } catch (error) {
    logger.error(`file upload error: ${(error as Error).message}`);
    res.status(500).json({ success: false, error: 'Failed to upload file' });
  }
});

export default router;
