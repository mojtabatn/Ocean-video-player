/**
 * GitHub repository that hosts Ocean's releases, as "owner/name". Updates and "What's new" read its Releases.
 * Empty = the About section says updates are not set up yet.
 */
export const GITHUB_REPO = 'mojtabatn/Ocean-video-player';

export type UpdateInfo = {
  configured: boolean;
  current: string;
  latest?: string;
  available: boolean;
  /** Release page, for "view on GitHub". */
  pageUrl?: string;
  assetName?: string;
  assetSize?: number;
  error?: string;
};

export type UpdateProgress = { received: number; total: number; done?: boolean; file?: string; error?: string };
