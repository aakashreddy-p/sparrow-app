// ---- Utils
import {
  DecodeGraphql,
  ReduceAuthHeader,
} from "@sparrow/workspaces/features/graphql-explorer/utils";
import { createDeepCopy, moveNavigation } from "@sparrow/common/utils";
import {
  CompareArray,
  Debounce,
  InitRequestTab,
  MarkdownFormatter,
} from "@sparrow/common/utils";

// ---- DB
import type {
  CollectionDocument,
  TabDocument,
  WorkspaceDocument,
} from "../../../../database/database";

// ---- Repo
import { TabRepository } from "../../../../repositories/tab.repository";
import { CollectionRepository } from "../../../../repositories/collection.repository";
import { WorkspaceRepository } from "../../../../repositories/workspace.repository";
import { EnvironmentRepository } from "../../../../repositories/environment.repository";
import { BehaviorSubject, Observable } from "rxjs";
import {
  Events,
  ItemType,
  ResponseStatusCode,
  UntrackedItems,
} from "@sparrow/common/enums";
import type { CreateDirectoryPostBody } from "@sparrow/common/dto";

// ---- Service
import {
  makeGraphQLRequest,
  makeHttpRequestV2,
} from "@app/containers/api/api.common";
import {
  insertCollection,
  insertCollectionDirectory,
  insertCollectionRequest,
  updateCollectionRequest,
} from "../../../../services/collection";
import { EnvironmentService } from "../../../../services/environment.service";

// ---- Events
import MixpanelEvent from "@app/utils/mixpanel/MixpanelEvent";

import {
  type Auth,
  type Body,
  type KeyValueChecked,
  type Response,
  type KeyValue,
  type StatePartial,
  type Conversation,
  MessageTypeEnum,
  ResponseSectionEnum,
  RequestDataTypeEnum,
  ResponseFormatterEnum,
} from "@sparrow/common/types/workspace";
import { notifications } from "@sparrow/library/ui";
import { GraphqlTabAdapter } from "../../../../adapter";
import { GuideRepository } from "../../../../repositories/guide.repository";
import { CollectionService } from "../../../../services/collection.service";
import { GuestUserRepository } from "../../../../repositories/guest-user.repository";
import { isGuestUserActive } from "@app/store/auth.store";
import { v4 as uuidv4 } from "uuid";
import { AiAssistantService } from "../../../../services/ai-assistant.service";
import type { GuideQuery } from "../../../../types/user-guide";
import { AiAssistantWebSocketService } from "../../../../services/ai-assistant.ws.service";
import type { Socket } from "socket.io-client";
import { graphqlExplorerDataStore } from "@sparrow/workspaces/features/graphql-explorer/store";
import { InitTab } from "@sparrow/common/factory";

class GraphqlExplorerViewModel {
  /**
   * Repository
   */
  private collectionRepository = new CollectionRepository();
  private workspaceRepository = new WorkspaceRepository();
  private environmentRepository = new EnvironmentRepository();
  private tabRepository = new TabRepository();
  private guideRepository = new GuideRepository();
  private guestUserRepository = new GuestUserRepository();
  private compareArray = new CompareArray();

  /**
   * Service
   */
  private environmentService = new EnvironmentService();
  private collectionService = new CollectionService();
  private aiAssistentService = new AiAssistantService();
  private aiAssistentWebSocketService = new AiAssistantWebSocketService();
  /**
   * Utils
   */
  private _decodeGraphql = new DecodeGraphql();
  /**
   * Rest tools
   */
  private _authHeader: BehaviorSubject<KeyValue> = new BehaviorSubject({
    key: "",
    value: "",
  });

  private _tab: BehaviorSubject<RequestTab> = new BehaviorSubject({});

  public constructor(doc: TabDocument) {
    if (doc?.isActive) {
      setTimeout(() => {
        const t = createDeepCopy(doc.toMutableJSON());
        delete t.isActive;
        delete t.index;
        this.tab = t;
        this.authHeader = new ReduceAuthHeader(
          this._tab.getValue().property.graphql?.state,
          this._tab.getValue().property.graphql?.auth,
        ).getValue();
      }, 0);
    }
  }

  public get activeWorkspace() {
    return this.workspaceRepository.getActiveWorkspace();
  }

  public get environments() {
    return this.environmentRepository.getEnvironment();
  }

  public get tab(): Observable<RequestTab> {
    return this._tab.asObservable();
  }

  private set tab(value: RequestTab) {
    this._tab.next(value);
  }

  public get authHeader(): Observable<{
    key: string;
    value: string;
  }> {
    return this._authHeader.asObservable();
  }

  private set authHeader(value: KeyValue) {
    this._authHeader.next(value);
  }

  /**
   * Compares the current request tab with the server version and updates the saved status accordingly.
   * This method is debounced to reduce the number of server requests.
   * @return A promise that resolves when the comparison is complete.
   */
  private compareRequestWithServerDebounced = async () => {
    let result = true;
    const progressiveTab: RequestTab = createDeepCopy(this._tab.getValue());
    const requestTabAdapter = new GraphqlTabAdapter();
    const unadaptedRequest = requestTabAdapter.unadapt(progressiveTab);
    let requestServer;
    if (progressiveTab.path.folderId) {
      requestServer = await this.collectionRepository.readRequestInFolder(
        progressiveTab.path.collectionId,
        progressiveTab.path.folderId,
        progressiveTab.id,
      );
    } else {
      requestServer =
        await this.collectionRepository.readRequestOrFolderInCollection(
          progressiveTab.path.collectionId,
          progressiveTab.id,
        );
    }
    if (!requestServer) result = false;
    // description
    else if (requestServer.description !== progressiveTab.description) {
      result = false;
    }
    // name
    else if (requestServer.name !== progressiveTab.name) {
      result = false;
    }
    // url
    else if (
      requestServer.graphql.url !== progressiveTab.property.graphql.url
    ) {
      result = false;
    }
    // query
    else if (
      requestServer.graphql.query !== progressiveTab.property.graphql.query
    ) {
      result = false;
    }
    // schema
    else if (
      requestServer.graphql.schema !== progressiveTab.property.graphql.schema
    ) {
      result = false;
    }
    // auth key
    else if (
      requestServer.graphql.auth.apiKey.authKey !==
      progressiveTab.property.graphql.auth.apiKey.authKey
    ) {
      result = false;
    }
    // auth value
    else if (
      requestServer.graphql.auth.apiKey.authValue !==
      progressiveTab.property.graphql.auth.apiKey.authValue
    ) {
      result = false;
    }
    // username
    else if (
      requestServer.graphql.auth.basicAuth.username !==
      progressiveTab.property.graphql.auth.basicAuth.username
    ) {
      result = false;
    }
    // password
    else if (
      requestServer.graphql.auth.basicAuth.password !==
      progressiveTab.property.graphql.auth.basicAuth.password
    ) {
      result = false;
    }
    // bearer tokem
    else if (
      requestServer.graphql.auth.bearerToken !==
      progressiveTab.property.graphql.auth.bearerToken
    ) {
      result = false;
    }
    // headers
    else if (
      !this.compareArray.init(
        requestServer.graphql.headers,
        progressiveTab.property.graphql.headers,
      )
    ) {
      result = false;
    }
    // result
    if (result) {
      this.tabRepository.updateTab(progressiveTab.tabId, {
        isSaved: true,
      });
      progressiveTab.isSaved = true;
      this.tab = progressiveTab;
    } else {
      this.tabRepository.updateTab(progressiveTab.tabId, {
        isSaved: false,
      });
      progressiveTab.isSaved = false;
      this.tab = progressiveTab;
    }
  };

  /**
   * Debounced method to compare the current request tab with the server version.
   */
  private compareRequestWithServer = new Debounce().debounce(
    this.compareRequestWithServerDebounced,
    1000,
  );
  /**
   *
   * @returns guest user
   */
  public getGuestUser = async () => {
    const response = await this.guestUserRepository.findOne({
      name: "guestUser",
    });
    return response?.getLatest().toMutableJSON();
  };

  /**
   *
   * @param _url - request url
   * @param _effectQueryParams  - flag that effect request query parameter
   */
  public updateRequestUrl = async (_url: string) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    if (_url === progressiveTab.property.graphql.url) {
      return;
    }
    progressiveTab.property.graphql.url = _url;
    this.tab = progressiveTab;
    await this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
    this.compareRequestWithServer();
  };

  /**
   *
   * @param _query - request query
   */
  public updateRequestQuery = async (_query: string) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    // if (_url === progressiveTab.property.graphql.url) {
    //   return;
    // }
    progressiveTab.property.graphql.query = _query;
    this.tab = progressiveTab;
    await this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
    this.compareRequestWithServer();
  };

  /**
   *
   * @param _path - request path
   */
  private updateRequestPath = async (_path: Path) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    progressiveTab.path = _path;
    this.tab = progressiveTab;
    await this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
    this.compareRequestWithServer();
  };

  /**
   *
   * @param _id - request mongo id
   */
  private updateRequestId = async (_id: string) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    progressiveTab.id = _id;
    this.tab = progressiveTab;
    await this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
    this.compareRequestWithServer();
  };

  /**
   *
   * @param _description - request description
   */
  public updateRequestDescription = async (_description: string) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    progressiveTab.description = _description;
    this.tab = progressiveTab;
    try {
      await this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
    } catch (error) {
      notifications.error(
        "Failed to update the documentation. Please try again",
      );
    }
    this.compareRequestWithServer();
  };

  /**
   * @description - updates request tab name
   * @param _name - new request name
   */
  public updateNameWithCollectionList = async (_name: string) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    if (_name !== progressiveTab.name) {
      progressiveTab.name = _name;
    }
    this.tab = progressiveTab;
  };

  /**
   *
   * @param _name - request name
   */
  public updateRequestName = async (_name: string) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    progressiveTab.name = _name;
    this.tab = progressiveTab;
    this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
    this.compareRequestWithServer();
  };

  /**
   * Updates the AI prompt in the request property of the current tab.
   *
   * @param  _prompt - The new AI prompt to set.
   * @returns A promise that resolves when the update is complete.
   */
  public updateRequestAIPrompt = async (_prompt: string) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    progressiveTab.property.graphql.ai.prompt = _prompt;
    this.tab = progressiveTab;
    this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
  };

  /**
   * Updates the AI thread ID in the request property of the current tab.
   *
   * @param _threadId - The new AI thread ID to set.
   * @returns A promise that resolves when the update is complete.
   */
  public updateRequestAIThread = async (_threadId: string) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    progressiveTab.property.graphql.ai.threadId = _threadId;
    this.tab = progressiveTab;
    this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
  };

  /**
   * Updates the AI conversations in the request property of the current tab.
   *
   * @param _conversations - The new AI conversations to set.
   * @returns  A promise that resolves when the update is complete.
   */
  public updateRequestAIConversation = async (
    _conversations: Conversation[],
  ) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    progressiveTab.property.graphql.ai.conversations = _conversations;
    this.tab = progressiveTab;
    await this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
  };

  /**
   *
   * @param method request method
   */
  public updateRequestMethod = async (method: string) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    progressiveTab.property.graphql.method = method;
    this.tab = progressiveTab;
    await this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
    this.compareRequestWithServer();
  };

  /**
   *
   * @param _headers - request headers
   */
  public updateHeaders = async (_headers: KeyValueChecked[]) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    progressiveTab.property.graphql.headers = _headers;
    this.tab = progressiveTab;
    await this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
    this.compareRequestWithServer();
  };

  /**
   *
   * @param headers - request auto generated headers
   */
  public updateAutoGeneratedHeaders = async (headers: KeyValueChecked[]) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    progressiveTab.property.graphql.autoGeneratedHeaders = headers;
    this.tab = progressiveTab;
    this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
  };

  /**
   *
   * @param _state - request state
   */
  public updateRequestState = async (_state: StatePartial) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    progressiveTab.property.graphql.state = {
      ...progressiveTab.property.graphql.state,
      ..._state,
    };
    this.tab = progressiveTab;
    await this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
  };

  /**
   *
   * @param  - response state
   */
  public updateResponseState = async (key, val) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    if (key === "responseNavigation") {
      graphqlExplorerDataStore.update((restApiDataMap) => {
        const data = restApiDataMap.get(progressiveTab?.tabId);
        if (data) {
          data.response.navigation = val;
        }
        restApiDataMap.set(progressiveTab.tabId, data);
        return restApiDataMap;
      });
    }
  };

  /**
   *
   * @param _auth - request auth
   */
  public updateRequestAuth = async (_auth: Auth) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    progressiveTab.property.graphql.auth = {
      ...progressiveTab.property.graphql.auth,
      ..._auth,
    };
    this.tab = progressiveTab;
    await this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
    this.authHeader = new ReduceAuthHeader(
      progressiveTab.property.graphql.state,
      progressiveTab.property.graphql.auth,
    ).getValue();
    this.compareRequestWithServer();
  };

  /**
   *
   * @param _body - request body
   */
  public updateRequestBody = async (_body: Body) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    progressiveTab.property.graphql.body = {
      ...progressiveTab.property.graphql.body,
      ..._body,
    };
    this.tab = progressiveTab;
    await this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
    this.compareRequestWithServer();
  };

  /**
   *
   * @param _response response
   */
  public updateResponse = async (_response: Response) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    progressiveTab.property.graphql.response = _response;
    this.tab = progressiveTab;
    this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
  };

  /**
   * @description clear response of a request
   */
  public clearResponse = async () => {
    const response: Response = new InitRequestTab(
      UntrackedItems.UNTRACKED,
      "UNTRACKED-",
    ).getValue().property.graphql.response;
    this.updateResponse(response);
  };

  /**
   * @description send request
   */
  public sendRequest = async (environmentVariables = []) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    const abortController = new AbortController();
    graphqlExplorerDataStore.update((restApiDataMap) => {
      let data = restApiDataMap.get(progressiveTab.tabId);
      if (data) {
        data.abortController = abortController;
      } else {
        data = {
          abortController: abortController,
          response: {
            body: "",
            headers: [],
            status: "",
            time: 0,
            size: 0,
            navigation: ResponseSectionEnum.RESPONSE,
          },
          isSendRequestInProgress: false,
        };
      }
      restApiDataMap.set(progressiveTab.tabId, data);
      return restApiDataMap;
    });
    // Create an AbortController for the request
    const { signal } = abortController; // Extract the signal for the request

    graphqlExplorerDataStore.update((restApiDataMap) => {
      let data = restApiDataMap.get(progressiveTab?.tabId);
      if (data) {
        data.isSendRequestInProgress = true;
      }
      restApiDataMap.set(progressiveTab.tabId, data);
      return restApiDataMap;
    });
    const start = Date.now();

    const decodeData = this._decodeGraphql.init(
      this._tab.getValue().property.graphql,
      environmentVariables.filtered || [],
    );
    makeGraphQLRequest(decodeData[0], decodeData[1], decodeData[2], signal)
      .then((response) => {
        const end = Date.now();
        const byteLength = new TextEncoder().encode(
          JSON.stringify(response),
        ).length;
        const responseSizeKB = byteLength / 1024;
        const duration = end - start;

        const responseBody = response.data.body;
        const formattedHeaders = Object.entries(response?.data?.headers || {});
        const responseHeaders = [];
        formattedHeaders.forEach((elem) => {
          responseHeaders.push({
            key: elem[0],
            value: elem[1],
          });
        });
        let responseStatus = response.data.status;

        graphqlExplorerDataStore.update((restApiDataMap) => {
          let data = restApiDataMap.get(progressiveTab?.tabId);
          if (data) {
            data.response.body = responseBody;
            data.response.headers = responseHeaders;
            data.response.status = responseStatus;
            data.response.time = duration;
            data.response.size = responseSizeKB;
            data.isSendRequestInProgress = false;
          }
          restApiDataMap.set(progressiveTab.tabId, data);
          return restApiDataMap;
        });
      })
      .catch((error) => {
        // Handle cancellation or other errors
        if (error.name === "AbortError") {
          return;
        }

        graphqlExplorerDataStore.update((restApiDataMap) => {
          const data = restApiDataMap.get(progressiveTab?.tabId);
          if (data) {
            data.response.body = "";
            data.response.headers = [];
            data.response.status = ResponseStatusCode.ERROR;
            data.response.time = 0;
            data.response.size = 0;
            data.isSendRequestInProgress = false;
          }
          restApiDataMap.set(progressiveTab.tabId, data);
          return restApiDataMap;
        });
      });
  };

  /**
   * aborts the ongoing api request
   */
  public cancelRequest = (): Promise<void> => {
    const progressiveTab = createDeepCopy(this._tab.getValue());
    let abortController;
    graphqlExplorerDataStore.update((restApiDataMap) => {
      const data = restApiDataMap.get(progressiveTab.tabId);
      if (data) {
        abortController = data.abortController;
      }
      return restApiDataMap;
    });
    if (abortController) {
      abortController.abort(); // Abort the request using the stored controller
      graphqlExplorerDataStore.update((restApiDataMap) => {
        const data = restApiDataMap.get(progressiveTab?.tabId);
        if (data) {
          data.isSendRequestInProgress = false;
        }
        restApiDataMap.set(progressiveTab.tabId, data);
        return restApiDataMap;
      });
    }
  };

  /**
   *
   * @param uuid  - collection id
   * @returns - collection Document
   */
  public readCollection = (uuid: string): Promise<CollectionDocument> => {
    return this.collectionRepository.readCollection(uuid);
  };

  /**
   *
   * @param collectionId - collection id
   * @param uuid - request or folder id
   * @returns - request document
   */
  public readRequestOrFolderInCollection = (
    collectionId: string,
    uuid: string,
  ): Promise<object> => {
    return this.collectionRepository.readRequestOrFolderInCollection(
      collectionId,
      uuid,
    );
  };

  /**
   *
   * @param collectionId - collection id
   * @param folderId - folder id
   * @param uuid - request id
   * @returns - request document
   */
  public readRequestInFolder = (
    collectionId: string,
    folderId: string,
    uuid: string,
  ) => {
    return this.collectionRepository.readRequestInFolder(
      collectionId,
      folderId,
      uuid,
    );
  };

  /**
   *
   * @param _workspaceMeta - workspace meta data
   * @param _collectionId - collection id
   * @param _folderName - folder name
   * @returns - folder status message
   */
  public createFolder = async (
    _workspaceMeta: {
      id: string;
      name: string;
    },
    _collectionId: string,
    _folderName: string,
  ) => {
    let userSource = {};
    const _collection: CollectionDocument =
      await this.readCollection(_collectionId);
    if (_collection?.activeSync) {
      userSource = {
        currentBranch: _collection?.currentBranch,
        source: "USER",
      };
    }
    const directory: CreateDirectoryPostBody = {
      name: _folderName,
      description: "",
      ...userSource,
    };

    let isGuestUser;
    isGuestUserActive.subscribe((value) => {
      isGuestUser = value;
    });

    if (isGuestUser == true) {
      const data = {
        id: uuidv4(),
        name: _folderName,
        description: "",
        type: "FOLDER",
        source: "USER",
        isDeleted: false,
        items: [],
        createdBy: "Guest User",
        updatedBy: "Guest User",
        createdAt: "",
        updatedAt: "",
      };

      const latestRoute = {
        id: data.id,
      };
      return {
        status: "success",
        data: {
          latestRoute,
          collectionId: _collectionId,
          data: data,
          addRequestOrFolderInCollection: this.addRequestOrFolderInCollection,
        },
      };
    }

    const res = await insertCollectionDirectory(
      _workspaceMeta.id,
      _collectionId,
      directory,
    );
    if (res.isSuccessful) {
      const latestRoute = {
        id: res.data.data.id,
      };
      return {
        status: "success",
        data: {
          latestRoute,
          collectionId: _collectionId,
          data: res.data.data,
          addRequestOrFolderInCollection: this.addRequestOrFolderInCollection,
        },
      };
    } else {
      return {
        status: "error",
        message: res.message,
      };
    }
  };

  /**
   *
   * @param _workspaceMeta - workspace meta data
   * @param _collectionName - collection name
   * @returns - collection status message
   */
  public createCollection = async (
    _workspaceMeta: {
      id: string;
      name: string;
    },
    _collectionName: string,
  ) => {
    const newCollection = {
      name: _collectionName,
      workspaceId: _workspaceMeta.id,
    };

    let isGuestUser;
    isGuestUserActive.subscribe((value) => {
      isGuestUser = value;
    });

    if (isGuestUser == true) {
      const data = {
        _id: uuidv4(),
        name: _collectionName,
        totalRequests: 0,
        createdBy: "Guest User",
        items: [],
        updatedBy: "Guest User",
        // createdAt: new Date().toISOString,
        // updatedAt: new Date().toISOString,
        createdAt: "",
        createdby: "",
      };
      const latestRoute = {
        id: data._id,
      };
      const storage = data;
      const _id = data._id;
      delete storage._id;
      storage.id = _id;
      storage.workspaceId = _workspaceMeta.id;
      MixpanelEvent(Events.CREATE_COLLECTION, {
        source: "SaveRequest",
        collectionName: data.name,
        collectionId: data._id,
      });
      return {
        status: "success",
        data: {
          latestRoute,
          storage,
          addCollection: this.addCollection,
        },
      };
    }

    const res = await insertCollection(newCollection);
    if (res.isSuccessful) {
      const latestRoute = {
        id: res.data.data._id,
      };
      const storage = res.data.data;
      const _id = res.data.data._id;
      delete storage._id;
      storage.id = _id;
      storage.workspaceId = _workspaceMeta.id;
      MixpanelEvent(Events.CREATE_COLLECTION, {
        source: "SaveRequest",
        collectionName: res.data.data.name,
        collectionId: res.data.data._id,
      });
      return {
        status: "success",
        data: {
          latestRoute,
          storage,
          addCollection: this.addCollection,
        },
      };
    } else {
      return {
        status: "error",
        message: res.message,
      };
    }
  };

  /**
   * Save Request
   * @param saveDescriptionOnly - refers save overall request data or only description as a documentation purpose.
   * @returns save status
   */
  public saveRequest = async () => {
    const componentData: RequestTab = this._tab.getValue();
    const { folderId, collectionId, workspaceId } = componentData.path;

    if (!workspaceId || !collectionId) {
      return {
        status: "error",
        message: "request is not a part of any workspace or collection",
      };
    }
    const _collection = await this.readCollection(collectionId);
    let userSource = {};
    if (_collection?.activeSync && componentData?.source === "USER") {
      userSource = {
        currentBranch: _collection?.currentBranch,
        source: "USER",
      };
    }
    const _id = componentData.id;

    const requestTabAdapter = new GraphqlTabAdapter();
    const unadaptedRequest = requestTabAdapter.unadapt(componentData);
    // Save overall api

    const requestMetaData = {
      id: _id,
      name: componentData?.name,
      description: componentData?.description,
      type: ItemType.GRAPHQL,
    };

    let folderSource;
    let itemSource;
    if (folderId) {
      folderSource = {
        folderId: folderId,
      };
      itemSource = {
        id: folderId,
        type: ItemType.FOLDER,
        items: {
          ...requestMetaData,
          graphql: unadaptedRequest,
        },
      };
    } else {
      itemSource = {
        ...requestMetaData,
        graphql: unadaptedRequest,
      };
    }

    let isGuestUser;
    isGuestUserActive.subscribe((value) => {
      isGuestUser = value;
    });
    if (isGuestUser === true) {
      const progressiveTab = this._tab.getValue();
      const data = {
        id: progressiveTab.id,
        name: requestMetaData.name,
        description: requestMetaData.description,
        type: "REQUEST",
        graphql: unadaptedRequest,
        updatedAt: "",
        updatedBy: "Guest User",
      };

      progressiveTab.isSaved = true;
      this.tab = progressiveTab;
      await this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
      if (!folderId) {
        this.collectionRepository.updateRequestOrFolderInCollection(
          collectionId,
          _id,
          data,
        );
      } else {
        this.collectionRepository.updateRequestInFolder(
          collectionId,
          folderId,
          _id,
          data,
        );
      }
      return {
        status: "success",
        message: "",
      };
    }
    const res = await this.collectionService.updateGraphqlInCollection(_id, {
      collectionId: collectionId,
      workspaceId: workspaceId,
      ...folderSource,
      ...userSource,
      items: itemSource,
    });

    if (res.isSuccessful) {
      const progressiveTab = this._tab.getValue();
      progressiveTab.isSaved = true;
      this.tab = progressiveTab;
      await this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
      if (!folderId) {
        this.collectionRepository.updateRequestOrFolderInCollection(
          collectionId,
          _id,
          res.data.data,
        );
      } else {
        this.collectionRepository.updateRequestInFolder(
          collectionId,
          folderId,
          _id,
          res.data.data,
        );
      }
      return {
        status: "success",
        message: res.message,
      };
    } else {
      return {
        status: "error",
        message: res.message,
      };
    }
  };

  /**
   *
   * @param uuid - workspace id
   * @returns workspace document
   */
  public readWorkspace = (uuid: string): Promise<WorkspaceDocument> => {
    return this.workspaceRepository.readWorkspace(uuid);
  };

  get collection() {
    return this.collectionRepository.getCollection();
  }

  set collection(e) {}

  /**
   *
   * @param collectionId - collection id
   * @param items - request or folder item
   */
  public addRequestOrFolderInCollection = (
    collectionId: string,
    items: object,
  ) => {
    this.collectionRepository.addRequestOrFolderInCollection(
      collectionId,
      items,
    );
  };

  /**
   *
   * @param collection - collection document
   */
  public addCollection = (collection: object) => {
    this.collectionRepository.addCollection(collection);
  };

  /**
   *
   * @param collectionId - collection id
   * @param folderId - folder id
   * @param request - request document
   */
  public addRequestInFolder = (
    collectionId: string,
    folderId: string,
    request: object,
  ): void => {
    this.collectionRepository.addRequestInFolder(
      collectionId,
      folderId,
      request,
    );
  };

  /**
   *
   * @param _workspaceMeta - workspace meta data
   * @param path - request stack path
   * @param tabName - request name
   * @param description - request description
   * @param type - save over all request or description only
   */
  public saveAsRequest = async (
    _workspaceMeta: {
      id: string;
      name: string;
    },
    path: {
      name: string;
      id: string;
      type: string;
    }[],
    tabName: string,
    description: string,
  ) => {
    const componentData = this._tab.getValue();
    let userSource = {};
    const _id = componentData.id;
    if (path.length > 0) {
      const requestTabAdapter = new GraphqlTabAdapter();
      const unadaptedRequest = requestTabAdapter.unadapt(componentData);
      let req = {
        id: uuidv4(),
        name: tabName,
        description,
        type: ItemType.GRAPHQL,
        graphql: unadaptedRequest,
        source: "USER",
        isDeleted: false,
        createdBy: "Guest User",
        updatedBy: "Guest User",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (path[path.length - 1].type === ItemType.COLLECTION) {
        /**
         * handle request at collection level
         */
        const _collection = await this.readCollection(path[path.length - 1].id);
        if (_collection?.activeSync) {
          userSource = {
            currentBranch: _collection?.currentBranch,
            source: "USER",
          };
        }
        let isGuestUser;
        isGuestUserActive.subscribe((value) => {
          isGuestUser = value;
        });

        if (isGuestUser == true) {
          this.addRequestOrFolderInCollection(path[path.length - 1].id, req);
          const expectedPath = {
            folderId: "",
            folderName: "",
            collectionId: path[path.length - 1].id,
            workspaceId: _workspaceMeta.id,
          };
          if (
            !componentData.path.workspaceId ||
            !componentData.path.collectionId
          ) {
            /**
             * Update existing request
             */
            this.updateRequestName(req.name);
            this.updateRequestDescription(req.description);
            this.updateRequestPath(expectedPath);
            this.updateRequestId(req.id);
            const progressiveTab = this._tab.getValue();
            progressiveTab.isSaved = true;
            this.tab = progressiveTab;
            await this.tabRepository.updateTab(
              progressiveTab.tabId,
              progressiveTab,
            );
          } else {
            /**
             * Create new copy of the existing request
             */
            const initRequestTab = new InitTab().graphQl(req.id, "UNTRACKED-");
            initRequestTab.updateName(req.name);
            initRequestTab.updateDescription(req.description);
            initRequestTab.updatePath(expectedPath);
            initRequestTab.updateUrl(req.graphql.url);
            initRequestTab.updateQuery(req.graphql.query);
            initRequestTab.updateSchema(req.graphql.schema);
            initRequestTab.updateAuth(req.graphql.auth);
            initRequestTab.updateHeaders(req.graphql.headers);

            this.tabRepository.createTab(initRequestTab.getValue());
            moveNavigation("right");
          }
          return {
            status: "success",
            message: "success",
            data: {
              id: req.id,
            },
          };
        }
        const res = await this.collectionService.addGraphqlInCollection({
          collectionId: path[path.length - 1].id,
          workspaceId: _workspaceMeta.id,
          ...userSource,
          items: {
            name: tabName,
            description,
            type: ItemType.GRAPHQL,
            graphql: unadaptedRequest,
          },
        });
        if (res.isSuccessful) {
          this.addRequestOrFolderInCollection(
            path[path.length - 1].id,
            res.data.data,
          );
          const expectedPath = {
            folderId: "",
            folderName: "",
            collectionId: path[path.length - 1].id,
            workspaceId: _workspaceMeta.id,
          };
          if (
            !componentData.path.workspaceId ||
            !componentData.path.collectionId
          ) {
            /**
             * Update existing request
             */
            await this.updateRequestName(res.data.data.name);
            await this.updateRequestDescription(res.data.data.description);
            await this.updateRequestPath(expectedPath);
            await this.updateRequestId(res.data.data.id);
            const progressiveTab = this._tab.getValue();
            progressiveTab.isSaved = true;
            this.tab = progressiveTab;
            await this.tabRepository.updateTab(
              progressiveTab.tabId,
              progressiveTab,
            );
          } else {
            /**
             * Create new copy of the existing request
             */
            const initRequestTab = new InitTab().graphQl(
              res.data.data.id,
              "UNTRACKED-",
            );
            initRequestTab.updateName(res.data.data.name);
            initRequestTab.updateDescription(res.data.data.description);
            initRequestTab.updatePath(expectedPath);
            initRequestTab.updateUrl(res.data.data.graphql.url);
            initRequestTab.updateQuery(res.data.data.graphql.query);
            initRequestTab.updateSchema(res.data.data.graphql.schema);
            initRequestTab.updateAuth(res.data.data.graphql.auth);
            initRequestTab.updateHeaders(res.data.data.graphql.headers);

            this.tabRepository.createTab(initRequestTab.getValue());
            moveNavigation("right");
          }
          return {
            status: "success",
            message: res.message,
            data: {
              id: res.data.data.id,
            },
          };
        } else {
          return {
            status: "error",
            message: res.message,
          };
        }
      } else if (path[path.length - 1].type === ItemType.FOLDER) {
        /**
         * handle request at folder level
         */
        const _collection = await this.readCollection(path[0].id);
        if (_collection?.activeSync) {
          userSource = {
            currentBranch: _collection?.currentBranch,
            source: "USER",
          };
        }
        let isGuestUser;
        isGuestUserActive.subscribe((value) => {
          isGuestUser = value;
        });

        if (isGuestUser == true) {
          this.addRequestInFolder(path[0].id, path[path.length - 1].id, req);
          const expectedPath = {
            folderId: path[path.length - 1].id,
            folderName: path[path.length - 1].name,
            collectionId: path[0].id,
            workspaceId: _workspaceMeta.id,
          };
          if (
            !componentData.path.workspaceId ||
            !componentData.path.collectionId
          ) {
            await this.updateRequestName(req.name);
            await this.updateRequestDescription(req.description);
            await this.updateRequestPath(expectedPath);
            await this.updateRequestId(req.id);
            const progressiveTab = this._tab.getValue();
            progressiveTab.isSaved = true;
            this.tab = progressiveTab;
            await this.tabRepository.updateTab(
              progressiveTab.tabId,
              progressiveTab,
            );
          } else {
            const initRequestTab = new InitTab().graphQl(req.id, "UNTRACKED-");
            initRequestTab.updateName(req.name);
            initRequestTab.updateDescription(req.description);
            initRequestTab.updatePath(expectedPath);
            initRequestTab.updateUrl(req.graphql.url);
            initRequestTab.updateQuery(req.graphql.query);
            initRequestTab.updateSchema(req.graphql.schema);
            initRequestTab.updateAuth(req.graphql.auth);
            initRequestTab.updateHeaders(req.graphql.headers);
            this.tabRepository.createTab(initRequestTab.getValue());
            moveNavigation("right");
          }
          return {
            status: "success",
            message: "success",
            data: {
              id: req.id,
            },
          };
        }
        const res = await this.collectionService.addGraphqlInCollection({
          collectionId: path[0].id,
          workspaceId: _workspaceMeta.id,
          folderId: path[path.length - 1].id,
          ...userSource,
          items: {
            id: path[path.length - 1].id,
            name: path[path.length - 1].name,
            type: ItemType.FOLDER,
            items: {
              name: tabName,
              description,
              type: ItemType.GRAPHQL,
              graphql: unadaptedRequest,
            },
          },
        });
        if (res.isSuccessful) {
          this.addRequestInFolder(
            path[0].id,
            path[path.length - 1].id,
            res.data.data,
          );
          const expectedPath = {
            folderId: path[path.length - 1].id,
            folderName: path[path.length - 1].name,
            collectionId: path[0].id,
            workspaceId: _workspaceMeta.id,
          };
          if (
            !componentData.path.workspaceId ||
            !componentData.path.collectionId
          ) {
            this.updateRequestName(res.data.data.name);
            this.updateRequestDescription(res.data.data.description);
            this.updateRequestPath(expectedPath);
            this.updateRequestId(res.data.data.id);
            const progressiveTab = this._tab.getValue();
            progressiveTab.isSaved = true;
            this.tab = progressiveTab;
            this.tabRepository.updateTab(progressiveTab.tabId, progressiveTab);
          } else {
            const initRequestTab = new InitTab().graphQl(
              res.data.data.id,
              "UNTRACKED-",
            );
            initRequestTab.updateName(res.data.data.name);
            initRequestTab.updateDescription(res.data.data.description);
            initRequestTab.updatePath(expectedPath);
            initRequestTab.updateUrl(res.data.data.graphql.url);
            initRequestTab.updateQuery(res.data.data.graphql.query);
            initRequestTab.updateSchema(res.data.data.graphql.schema);
            initRequestTab.updateAuth(res.data.data.graphql.auth);
            initRequestTab.updateHeaders(res.data.data.graphql.headers);
            this.tabRepository.createTab(initRequestTab.getValue());
            moveNavigation("right");
          }
          return {
            status: "success",
            message: res.message,
            data: {
              id: res.data.data.id,
            },
          };
        } else {
          return {
            status: "error",
            message: res.message,
          };
        }
      }
      MixpanelEvent(Events.SAVE_API_REQUEST);
    }
  };

  /**
   *
   * @param isGlobalVariable - defines to save local or global
   * @param environmentVariables - pre existing environment data
   * @param newVariableObj - new entry to be extended
   * @returns
   */
  public updateEnvironment = async (
    isGlobalVariable: boolean,
    environmentVariables,
    newVariableObj: KeyValue,
  ) => {
    let isGuestUser;
    isGuestUserActive.subscribe((value) => {
      isGuestUser = value;
    });
    if (isGlobalVariable) {
      // api payload
      let payload = {
        name: environmentVariables.global.name,
        variable: [
          ...environmentVariables.global.variable,
          {
            key: newVariableObj.key,
            value: newVariableObj.value,
            checked: true,
          },
        ],
      };
      // removes blank key value pairs
      payload.variable = [
        ...payload.variable.filter((variable) => {
          return variable.key.length > 0;
        }),
        {
          key: "",
          value: "",
          checked: false,
        },
      ];

      if (isGuestUser === true) {
        // updates environment list
        this.environmentRepository.updateEnvironment(
          environmentVariables.global.id,
          payload,
        );

        let currentTab = await this.tabRepository.getTabById(
          environmentVariables.global.id,
        );
        if (currentTab) {
          let currentTabId = currentTab.tabId;
          const envTab = createDeepCopy(currentTab);
          envTab.property.environment.variable = payload.variable;
          envTab.isSaved = true;
          await this.tabRepository.updateTab(currentTabId as string, {
            property: envTab.property,
            isSaved: envTab.isSaved,
          });
        }

        notifications.success("Environment variable added successfully.");
        return {
          isSuccessful: true,
        };
      }
      const response = await this.environmentService.updateEnvironment(
        this._tab.getValue().path.workspaceId,
        environmentVariables.global.id,
        payload,
      );
      if (response.isSuccessful) {
        // updates environment list
        this.environmentRepository.updateEnvironment(
          response.data.data._id,
          response.data.data,
        );

        let currentTab = await this.tabRepository.getTabById(
          response.data.data._id,
        );

        if (currentTab) {
          let currentTabId = currentTab.tabId;
          const envTab = createDeepCopy(currentTab);
          envTab.property.environment.variable = response.data.data.variable;
          envTab.isSaved = true;
          await this.tabRepository.updateTab(currentTabId as string, {
            property: envTab.property,
            isSaved: envTab.isSaved,
          });
        }

        notifications.success("Environment variable added successfully.");
      } else {
        notifications.error(
          "Failed to add environment variable. Please try again.",
        );
      }
      return response;
    } else {
      // api payload
      const payload = {
        name: environmentVariables.local.name,
        variable: [
          ...environmentVariables.local.variable,
          {
            key: newVariableObj.key,
            value: newVariableObj.value,
            checked: true,
          },
        ],
      };
      // removes blank key value pairs
      payload.variable = [
        ...payload.variable.filter((variable) => {
          return variable.key.length > 0;
        }),
        {
          key: "",
          value: "",
          checked: false,
        },
      ];
      if (isGuestUser) {
        // updates environment list
        this.environmentRepository.updateEnvironment(
          environmentVariables.local.id,
          payload,
        );

        let currentTab = await this.tabRepository.getTabById(
          environmentVariables.local.id,
        );

        if (currentTab) {
          let currentTabId = currentTab.tabId;
          const envTab = createDeepCopy(currentTab);
          envTab.property.environment.variable = payload.variable;
          envTab.isSaved = true;
          await this.tabRepository.updateTab(currentTabId as string, {
            property: envTab.property,
            isSaved: envTab.isSaved,
          });
        }

        notifications.success("Environment variable added successfully.");
        return {
          isSuccessful: true,
        };
      }
      // api response
      const response = await this.environmentService.updateEnvironment(
        this._tab.getValue().path.workspaceId,
        environmentVariables.local.id,
        payload,
      );
      if (response.isSuccessful) {
        // updates environment list
        this.environmentRepository.updateEnvironment(
          response.data.data._id,
          response.data.data,
        );

        let currentTab = await this.tabRepository.getTabById(
          response.data.data._id,
        );
        if (currentTab) {
          const currentTabId = currentTab.tabId;
          const envTab = createDeepCopy(currentTab);
          envTab.property.environment.variable = response.data.data.variable;
          envTab.isSaved = true;
          await this.tabRepository.updateTab(currentTabId as string, {
            property: envTab.property,
            isSaved: envTab.isSaved,
          });
        }

        notifications.success("Environment variable added successfully.");
      } else {
        notifications.error(
          "Failed to add environment variable. Please try again.",
        );
      }
      return response;
    }
  };
  /**
   * Fetches a collection guide based on the provided query.
   *
   * @param query - The query object used to find the collection guide.
   * @returns - A promise that resolves to the collection guide found by the query.
   */
  public fetchCollectionGuide = async (query: GuideQuery) => {
    return await this.guideRepository.findOne(query);
  };

  /**
   * Updates the collection guide to set its active status.
   *
   * @param  query - The query object used to find the collection guide to update.
   * @param  isActive - The new active status to set for the collection guide.
   * @returns - A promise that resolves when the update operation is complete.
   */
  public updateCollectionGuide = async (
    query: GuideQuery,
    isActive: boolean,
  ) => {
    await this.guideRepository.update(query, {
      isActive: isActive,
    });
  };

  /**
   * Handles collection rename
   * @param collection - collction to rename
   * @param newCollectionName :string - the new name of the collection
   */
  public handleRenameCollection = async (
    workspaceId: string,
    collectionId: string,
    newCollectionName: string,
  ) => {
    let isGuestUser;
    isGuestUserActive.subscribe((value) => {
      isGuestUser = value;
    });
    if (newCollectionName) {
      if (isGuestUser == true) {
        let col = await this.collectionRepository.readCollection(collectionId);
        col = col.toMutableJSON();
        col.name = newCollectionName;
        this.collectionRepository.updateCollection(collectionId, col);
        // notifications.success("Collection renamed successfully!");
        return {
          isSuccessful: true,
        };
      }
      const response = await this.collectionService.updateCollectionData(
        collectionId,
        workspaceId,
        { name: newCollectionName },
      );
      if (response.isSuccessful) {
        this.collectionRepository.updateCollection(
          collectionId,
          response.data.data,
        );
        // notifications.success("Collection renamed successfully!");
      } else if (response.message === "Network Error") {
        notifications.error(response.message);
      } else {
        notifications.error("Failed to rename collection. Please try again.");
      }
      return response;
    }
  };

  /**
   * Handle folder rename
   * @param workspaceId - workspace id of the folder
   * @param collectionId - collection id of the folder
   * @param folderId  - folder id to be targetted
   * @param newFolderName - new folder name
   * @returns
   */
  public handleRenameFolder = async (
    workspaceId: string,
    collectionId: string,
    folderId: string,
    newFolderName: string,
  ) => {
    const collection =
      await this.collectionRepository.readCollection(collectionId);
    const explorer =
      await this.collectionRepository.readRequestOrFolderInCollection(
        collectionId,
        folderId,
      );
    if (newFolderName) {
      let userSource = {};
      if (collection.activeSync && explorer?.source === "USER") {
        userSource = {
          currentBranch: collection.currentBranch
            ? collection.currentBranch
            : collection.primaryBranch,
          source: "USER",
        };
      }
      let isGuestUser;
      isGuestUserActive.subscribe((value) => {
        isGuestUser = value;
      });
      if (isGuestUser === true) {
        const res =
          await this.collectionRepository.readRequestOrFolderInCollection(
            collectionId,
            folderId,
          );
        res.name = newFolderName;

        this.collectionRepository.updateRequestOrFolderInCollection(
          collectionId,
          folderId,
          res,
        );
        // notifications.success("Folder renamed successfully!");
        return {
          isSuccessful: true,
        };
      }
      const response = await this.collectionService.updateFolderInCollection(
        workspaceId,
        collectionId,
        folderId,
        {
          ...userSource,
          name: newFolderName,
        },
      );
      if (response.isSuccessful) {
        this.collectionRepository.updateRequestOrFolderInCollection(
          collectionId,
          folderId,
          response.data.data,
        );
        // notifications.success("Folder renamed successfully!");
      } else {
        notifications.error("Failed to rename folder. Please try again.");
      }
      return response;
    }
  };

  /**
   * Updates the message property of the last conversation in chunks.
   *
   * This function takes a string `data`, divides it into chunks of size `chunkSize`,
   * and appends each chunk to the last conversation message in the component's data.
   * The chunks are appended at intervals specified by `delay`.
   *
   * @param data - The string data to be displayed in chunks.
   * @param chunkSize - The number of characters per chunk.
   * @param delay - The delay in milliseconds between each chunk display.
   */
  private displayDataInChunks = async (data, chunkSize, delay) => {
    let index = 0;

    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    const displayNextChunk = async () => {
      if (index < data.length) {
        const chunk = data.slice(index, index + chunkSize);
        const componentData = this._tab.getValue();
        const length =
          componentData?.property?.graphql?.ai?.conversations.length;
        componentData.property.graphql.ai.conversations[length - 1].message =
          componentData.property.graphql.ai.conversations[length - 1].message +
          chunk;
        await this.updateRequestAIConversation([
          ...componentData.property.graphql.ai.conversations,
        ]);
        index += chunkSize;
        await sleep(delay);
        await displayNextChunk();
      }
    };

    await displayNextChunk();
  };

  /**
   * Get workspace data through workspace id
   * @param workspaceId - id of workspace
   * @returns - workspace document
   */
  public getWorkspaceById = async (workspaceId: string) => {
    return await this.workspaceRepository.readWorkspace(workspaceId);
  };

  /**
   * Generates an AI response based on the given prompt.
   *
   * @param prompt - The prompt to send to the AI assistant service.
   * @returns A promise that resolves to the response from the AI assistant service.
   */
  public generateAiResponse = async (prompt = "") => {
    // Set the request state to indicate that a response is being generated
    await this.updateRequestState({ isChatbotGeneratingResponse: true });
    const componentData = this._tab.getValue();
    const apiData = {
      body: componentData.property.graphql.body,
      headers: componentData.property.graphql.headers,
      method: componentData.property.graphql.method,
      queryParams: componentData.property.graphql.queryParams,
      url: componentData.property.graphql.url,
      auth: componentData.property.graphql.auth,
    };

    // Call the AI assistant service to generate a response
    const response = await this.aiAssistentService.generateAiResponse({
      text: prompt,
      instructions: `You are an AI Assistant, responsible for answering API related queries. Give the response only in markdown format. Only answer questions related to the provided API data and API Management. Give to the point and concise responses, only give explanations when they are asked for. Always follow best practices for REST API and answer accordingly. Utilize the provided api data ${JSON.stringify(
        apiData,
      )}. Never return the result same as prompt.`,
      threadId: componentData?.property?.graphql?.ai?.threadId,
    });
    if (response.isSuccessful) {
      const data = response.data.data;
      // Update the AI thread ID and conversation with the new data
      await this.updateRequestAIThread(data.threadId);
      await this.updateRequestAIConversation([
        ...(componentData?.property?.graphql?.ai?.conversations || []),
        {
          message: "",
          messageId: data.messageId,
          type: MessageTypeEnum.RECEIVER,
          isLiked: false,
          isDisliked: false,
          status: true,
        },
      ]);
      await this.displayDataInChunks(data.result, 100, 300);
    } else {
      // Update the conversation with an error message
      let errorMessage = "Something went wrong! Please try again.";
      if (response.message === "Limit reached") {
        errorMessage =
          "Oh, snap! You have reached your limit for this month. You can resume using Sparrow AI from the next month. Please share your feedback through the community section.";
      }
      this.updateRequestAIConversation([
        ...(componentData?.property?.graphql?.ai?.conversations || []),
        {
          message: errorMessage,
          messageId: uuidv4(),
          type: MessageTypeEnum.RECEIVER,
          isLiked: false,
          isDisliked: false,
          status: false,
        },
      ]);
    }
    // Set the request state to indicate that the response generation is complete
    await this.updateRequestState({ isChatbotGeneratingResponse: false });
    return response;
  };

  /*
   * Generates stream wise an AI response based on the given prompt.
   *
   * @param prompt - The prompt to send to the AI assistant service.
   * @returns A promise that resolves to the response from the AI assistant service.
   */
  public generateStreamAiResponse = async (prompt = "") => {
    // Set the request state to indicate that a response is being generated
    await this.updateRequestState({ isChatbotGeneratingResponse: true });
    let componentData = this._tab.getValue();
    const apiData = {
      body: componentData.property.graphql.body,
      headers: componentData.property.graphql.headers,
      method: componentData.property.graphql.method,
      queryParams: componentData.property.graphql.queryParams,
      url: componentData.property.graphql.url,
      auth: componentData.property.graphql.auth,
    };
    const socketValue: Socket =
      await this.aiAssistentWebSocketService.sendPromptMessage({
        text: prompt,
        instructions: `You are an AI Assistant, responsible for answering API related queries. Give the response only in markdown format. Only answer questions related to the provided API data and API Management. Give to the point and concise responses, only give explanations when they are asked for. Always follow best practices for REST API and answer accordingly. Utilize the provided api data ${JSON.stringify(
          apiData,
        )}. Never return the result same as prompt.`,
        tabId: componentData.tabId,
        threadId: componentData?.property?.graphql?.ai?.threadId,
      });
    let updatePromise = Promise.resolve(); // Initialize a promise chain
    socketValue.off(`aiResponse_${componentData.tabId}`);
    socketValue?.on(`aiResponse_${componentData.tabId}`, async (response) => {
      updatePromise = updatePromise.then(async () => {
        // Check if the conversation already contains the messageId
        componentData = this._tab.getValue();
        const existingMessageIndex =
          componentData.property.graphql.ai.conversations.findIndex((conv) => {
            return conv.messageId === response.messageId;
          });
        if (existingMessageIndex === -1 && response?.status) {
          // If the messageId does not exist, add a new message entry

          await this.updateRequestAIThread(response.threadId);
          await this.updateRequestAIConversation([
            ...componentData.property.graphql.ai.conversations,
            {
              messageId: response.messageId,
              message: response.result,
              type: MessageTypeEnum.RECEIVER,
              isLiked: false,
              isDisliked: false,
              status: true,
            },
          ]);
        } else if (response?.status) {
          componentData.property.graphql.ai.conversations[
            existingMessageIndex
          ].message =
            componentData.property.graphql.ai.conversations[
              existingMessageIndex
            ].message + response.result;
          await this.updateRequestAIConversation([
            ...componentData.property.graphql.ai.conversations,
          ]);
        }
        if (response?.status === "Completed") {
          await this.updateRequestState({
            isChatbotGeneratingResponse: false,
          });
        }
        if (response?.status === "Failed") {
          await this.updateRequestState({
            isChatbotGeneratingResponse: false,
          });
          // Update the conversation with an error message
          this.updateRequestAIConversation([
            ...(componentData?.property?.graphql?.ai?.conversations || []),
            {
              message: "Something went wrong! Please try again.",
              messageId: uuidv4(),
              type: MessageTypeEnum.RECEIVER,
              isLiked: false,
              isDisliked: false,
              status: false,
            },
          ]);
        }
      });
    });
  };

  /**
   * Generates documentation for the particular API Request Tab.
   *
   * @param prompt - The prompt to be used for generating the documentation.
   * @returns - The response from the AI assistant service.
   */

  public generateDocumentation = async (prompt = "") => {
    await this.updateRequestState({ isDocGenerating: true });
    const componentData = this._tab.getValue();
    const apiData = {
      body: componentData.property.graphql.body,
      headers: componentData.property.graphql.headers,
      method: componentData.property.graphql.method,
      queryParams: componentData.property.graphql.queryParams,
      url: componentData.property.graphql.url,
      auth: componentData.property.graphql.auth,
    };
    prompt += `. Utilize the provided api data ${JSON.stringify(apiData)}`;
    const response = await this.aiAssistentService.generateAiResponse({
      text: prompt,
      instructions: `You are an AI Assistant to generate documentation, responsible to generate documentation for API requests, Give response only in text format not in markdown.`,
    });
    if (response.isSuccessful) {
      const formatter = new MarkdownFormatter();
      const formattedData = await formatter.FormatData(
        response.data.data.result,
      );
      const stringifyData = JSON.stringify(formattedData.blocks);
      await this.updateRequestDescription(stringifyData);
      await this.updateRequestState({
        isDocAlreadyGenerated: true,
      });
    } else if (response?.message === "Limit reached") {
      notifications.error(
        "Failed to generate documentation. Your monthly AI usage limit is reached.",
      );
    }
    setTimeout(async () => {
      // renders response before disabling the editor
      await this.updateRequestState({ isDocGenerating: false });
    }, 1000);
  };

  /**
   * Toggles the like or dislike status of a chat message.
   *
   * @param _messageId - The ID of the message to update.
   * @param  _flag - The flag indicating whether the message is liked (true) or disliked (false).
   */
  public toggleChatMessageLike = (_messageId: string, _flag: boolean) => {
    const componentData = this._tab.getValue();
    const data = componentData?.property?.graphql?.ai;
    this.aiAssistentService.updateAiStats(data.threadId, _messageId, _flag);

    // Map through the conversations and update the like or dislike status of the specified message
    const convo = data?.conversations?.map((elem) => {
      if (elem.messageId === _messageId) {
        if (_flag) {
          elem.isLiked = true;
          elem.isDisliked = false;
        } else {
          elem.isLiked = false;
          elem.isDisliked = true;
        }
      }
      return elem;
    });
    this.updateRequestAIConversation(convo);
  };

  /**
   * Refreshes the tab data by updating conversations and chatbot state from the server.
   *
   * @param tab - The tab data from the server to refresh the current tab data with.
   */
  public refreshTabData = (tab: RequestTab) => {
    const progressiveTab = createDeepCopy(this._tab.getValue());

    if (progressiveTab?.property?.graphql?.ai?.conversations) {
      // Handles AiConversationClient state
      const AiConversationClient =
        progressiveTab?.property?.graphql?.ai.conversations;
      const AiConversationServer = tab.property.graphql.ai.conversations;
      if (AiConversationServer.length > AiConversationClient.length) {
        progressiveTab.property.graphql.ai.conversations =
          tab.property.graphql.ai.conversations;
        this.tab = progressiveTab;
      }
    }
    if (progressiveTab?.property?.graphql?.state) {
      // Handles isChatbotGeneratingResponseClient state
      const isChatbotGeneratingResponseClient =
        progressiveTab?.property?.graphql?.state?.isChatbotGeneratingResponse;
      const isChatbotGeneratingResponseServer =
        tab.property.graphql.state.isChatbotGeneratingResponse;
      if (
        isChatbotGeneratingResponseServer !== isChatbotGeneratingResponseClient
      ) {
        progressiveTab.property.graphql.state.isChatbotGeneratingResponse =
          tab.property.graphql.state.isChatbotGeneratingResponse;
        this.tab = progressiveTab;
      }
      // Handles isDocGenerating state
      const isDocGeneratingClient =
        progressiveTab?.property?.graphql?.state?.isDocGenerating;
      const isDocGeneratingServer = tab.property.graphql.state.isDocGenerating;
      if (isDocGeneratingServer !== isDocGeneratingClient) {
        progressiveTab.property.graphql.state.isDocGenerating =
          tab.property.graphql.state.isDocGenerating;
        this.tab = progressiveTab;
      }
      // Handles isDocAlreadyGeneratedClient state
      const isDocAlreadyGeneratedClient =
        progressiveTab?.property?.graphql?.state?.isDocAlreadyGenerated;
      const isDocAlreadyGeneratedServer =
        tab.property.graphql.state.isDocAlreadyGenerated;
      if (isDocAlreadyGeneratedServer !== isDocAlreadyGeneratedClient) {
        progressiveTab.property.graphql.state.isDocAlreadyGenerated =
          tab.property.graphql.state.isDocAlreadyGenerated;
        this.tab = progressiveTab;
      }
    }
    if (progressiveTab) {
      // Handles apiDescriptionClient state
      const apiDescriptionClient = progressiveTab?.description;
      const apiDescriptionServer = tab.description;
      if (apiDescriptionServer !== apiDescriptionClient) {
        progressiveTab.description = tab.description;
        this.tab = progressiveTab;
      }
    }
  };
}

export default GraphqlExplorerViewModel;
