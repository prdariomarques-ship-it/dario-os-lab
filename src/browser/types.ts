export interface BrowserCapabilities {
  navigate(url: string): Promise<string>;
  inspect(): Promise<string>;
  extractContent(selector: string): Promise<string>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  screenshot(): Promise<Buffer>;
}

export interface BrowserEngine {
  execute(action: string, params: any, taskId: string): Promise<any>;
}
