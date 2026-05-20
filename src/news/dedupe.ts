import type { NewsRepository } from '../storage/repositories/news-repo.js';

export class NewsDedupe {
  constructor(private readonly newsRepo: NewsRepository) {}

  isDuplicate(newsId: string): boolean {
    return this.newsRepo.exists(newsId);
  }

  shouldProcess(newsId: string): boolean {
    return !this.newsRepo.exists(newsId) && !this.newsRepo.isProcessed(newsId);
  }
}
