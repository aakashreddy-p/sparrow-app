import {
  type Path,
  type KeyValueChecked,
  TabTypeEnum,
} from "@common/types/workspace";
import {
  SocketDataTypeEnum,
  SocketSectionEnum,
  WebSocketDefault,
  type State,
  type StatePartial,
  type StateWrapper,
  type WebSocketTab,
} from "@common/types/workspace/web-socket";
import { v4 as uuidv4 } from "uuid";

class InitWebSocketTab {
  private _tab: WebSocketTab;
  /**
   *
   * @param _id - Request mongo id
   * @param _workspaceId - Workspace Id to which Request belongs to
   */
  constructor(_id: string, _workspaceId: string) {
    this._tab = {
      id: _id,
      tabId: uuidv4(),
      name: WebSocketDefault.NAME,
      type: TabTypeEnum.WEB_SOCKET,
      description: "",
      source: "USER",
      isDeleted: false,
      activeSync: false,
      property: {
        websocket: {
          url: "",
          headers: [
            {
              key: "",
              value: "",
              checked: false,
            },
          ],
          queryParams: [
            {
              key: "",
              value: "",
              checked: false,
            },
          ],
          autoGeneratedHeaders: [
            {
              key: "Sec-WebSocket-Version",
              value: "13",
              checked: true,
            },
            {
              key: "Sec-WebSocket-Key",
              value: uuidv4(),
              checked: true,
            },
            {
              key: "Connection",
              value: "Upgrade",
              checked: true,
            },
            {
              key: "Upgrade",
              value: "websocket",
              checked: true,
            },
          ],
          message: "",
          state: {
            socketNavigation: SocketSectionEnum.MESSAGE,
            socketMessageLanguage: SocketDataTypeEnum.TEXT,
            socketLeftSplitterWidthPercentage: 50,
            socketRightSplitterWidthPercentage: 50,
            isSaveSocketInProgress: false,
            isParameterBulkEditActive: false,
            isHeaderBulkEditActive: false,
          },
        },
      },
      path: {
        workspaceId: _workspaceId,
        collectionId: "",
        folderId: "",
      },
      isSaved: true,
      index: 0,
      isActive: true,
      timestamp: new Date().toString(),
    };
    if (!_id || !_workspaceId) {
      console.error("invalid id or workspace id on create new tab web socket!");
    }
  }
  public getValue(): WebSocketTab {
    return this._tab;
  }
  public updateId(_id: string) {
    this._tab.id = _id;
  }
  public updateName(_name: string) {
    this._tab.name = _name;
  }
  public updateDescription(_description: string) {
    this._tab.description = _description;
  }
  public updatePath(_path: Path) {
    this._tab.path = _path;
  }
  public updateUrl(_url: string) {
    if (_url) {
      this._tab.property.websocket.url = _url;
    }
  }
  public updateQueryParams(_queryParams: KeyValueChecked[]) {
    if (_queryParams) {
      this._tab.property.websocket.queryParams = _queryParams;
    }
  }
  public updateHeaders(_headers: KeyValueChecked[]) {
    if (_headers) {
      this._tab.property.websocket.headers = _headers;
    }
  }
  public updateMessage(_message: string) {
    this._tab.property.websocket.message = _message;
  }
  public updateAutoGeneratedHeaders(_autoGeneratedHeaders: KeyValueChecked[]) {
    this._tab.property.websocket.autoGeneratedHeaders = _autoGeneratedHeaders;
  }
  public updateIsSave(_isSave: boolean) {
    this._tab.isSaved = _isSave;
  }
  public updateState(_state: Partial<State>) {
    this._tab.property.websocket.state = {
      ...this._tab.property.websocket.state,
      ..._state,
    };
  }
}

export { InitWebSocketTab };
