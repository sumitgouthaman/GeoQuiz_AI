export interface Country {
  name: string;
  capital: string;
}

export type QuestionType = 'ask_capital' | 'ask_country';

export interface Question {
  country: Country;
  type: QuestionType;
}

export type GameStatus = 'playing' | 'answered' | 'loading_hint' | 'loading_info' | 'loading_question' | 'error';

export interface GroundingChunk {
  web?: {
    // FIX: Made uri optional to match the type from @google/genai SDK.
    uri?: string;
    // FIX: Made title optional to match the type from @google/genai SDK.
    title?: string;
  };
  maps?: {
    // FIX: Made uri optional to match the type from @google/genai SDK.
    uri?: string;
    // FIX: Made title optional to match the type from @google/genai SDK.
    title?: string;
  }
}

export interface CountryInfo {
  summary: string;
  facts: string[];
  mapQuery: string;
  photoPrompt: string;
}