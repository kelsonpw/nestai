/**
 * RealOcrProvider — cloud Document AI skeleton (e.g. Google Document AI or
 * Azure Document Intelligence). Compiles; throws a descriptive error until a
 * processor endpoint + credentials are configured.
 */
import type { OcrProvider } from '@nestai/contracts';

export interface RealOcrConfig {
  provider?: 'google-document-ai' | 'azure-document-intelligence';
  /** Processor / endpoint URL. */
  endpoint?: string;
  apiKey?: string;
}

export class RealOcrProvider implements OcrProvider {
  private readonly config: RealOcrConfig;

  constructor(config: RealOcrConfig = {}) {
    this.config = config;
  }

  async extract(_file: {
    url?: string;
    bytes?: Uint8Array;
    mimeType: string;
  }): Promise<{ text: string; blocks?: unknown[] }> {
    if (!this.config.endpoint || !this.config.apiKey) {
      throw new Error(
        'RealOcrProvider is not configured. Provide { endpoint, apiKey } for a Document AI ' +
          'processor, or use PROVIDER_MODE=mock.',
      );
    }
    // TODO: POST the document bytes/URL to the Document AI processor and map
    // the response onto { text, blocks }.
    throw new Error('RealOcrProvider.extract is not implemented yet.');
  }
}
