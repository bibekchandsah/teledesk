import { Request, Response } from 'express';
import axios from 'axios';
import logger from '../utils/logger';

/**
 * Fetches the latest release info from GitHub and proxies it
 * This protects the GITHUB_TOKEN and prevents client-side rate limits
 */
export const getLatestRelease = async (req: Request, res: Response) => {
  try {
    const GITHUB_REPO = 'bibekchandsah/teledesk';
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'TeleDesk-Backend-Proxy',
    };

    if (GITHUB_TOKEN) {
      headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }

    const response = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers,
    });

    res.json(response.data);
  } catch (error: any) {
    logger.error(`[UpdateController] Failed to fetch latest release: ${error.message}`);
    
    if (error.response) {
      return res.status(error.response.status).json({
        message: 'Failed to fetch release from GitHub',
        error: error.response.data
      });
    }
    
    res.status(500).json({ message: 'Internal server error during update check' });
  }
};
