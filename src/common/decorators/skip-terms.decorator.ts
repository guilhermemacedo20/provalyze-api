import { SetMetadata } from '@nestjs/common';

export const SKIP_TERMS_KEY = 'skipTerms';

export const SkipTerms = () => SetMetadata(SKIP_TERMS_KEY, true);
