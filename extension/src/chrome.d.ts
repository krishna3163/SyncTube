declare namespace chrome {
  namespace runtime {
    const lastError: { message?: string } | undefined;
    function sendMessage(message: any, responseCallback?: (response: any) => void): void;
    const onMessage: {
      addListener(callback: (message: any, sender: any, sendResponse: (response?: any) => void) => boolean | void): void;
    };
  }

  namespace storage {
    interface StorageArea {
      get(keys: string | string[] | Record<string, any>, callback: (items: Record<string, any>) => void): void;
      set(items: Record<string, any>, callback?: () => void): void;
    }
    const local: StorageArea;
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      title?: string;
    }
    function query(queryInfo: { active?: boolean; currentWindow?: boolean }, callback: (result: Tab[]) => void): void;
    function sendMessage(tabId: number, message: any, responseCallback?: (response: any) => void): void;
  }
}
