import { detectJobPosting } from '@/lib/job-detect';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    browser.runtime.onMessage.addListener((message) => {
      if (message && typeof message === 'object' && message.type === 'DETECT_JOB') {
        return Promise.resolve(detectJobPosting(document, location.href));
      }
      return undefined;
    });
  },
});
