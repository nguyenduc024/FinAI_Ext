export interface TermExplanation {
  term: string;
  termEnglish: string | null;
  definition: string;
  definitionEnglish: string | null;
  example: string | null;
  contextExplanation: string;
  relatedTerms: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export interface LookupRequest {
  type: 'LOOKUP_TERM';
  selectedText: string;
  surroundingContext: string;
  pageUrl: string;
}

export interface LookupResponse {
  type: 'LOOKUP_RESULT';
  success: boolean;
  data?: TermExplanation;
  error?: string;
  fromCache?: boolean;
}

export interface SettingsUpdateMessage {
  type: 'SETTINGS_UPDATED';
}

export interface GetSettingsRequest {
  type: 'GET_SETTINGS';
}

export interface GetSettingsResponse {
  type: 'GET_SETTINGS_RESULT';
  settings: ExtensionSettings;
}

export interface TestApiKeyRequest {
  type: 'TEST_API_KEY';
  apiKey: string;
}

export interface TestApiKeyResponse {
  type: 'TEST_API_KEY_RESULT';
  success: boolean;
  error?: string;
}

export interface ExtensionSettings {
  apiKey: string;
  apiEndpoint?: string;
  enabled: boolean;
}

export type ExtensionMessage = LookupRequest | SettingsUpdateMessage | GetSettingsRequest | TestApiKeyRequest;
