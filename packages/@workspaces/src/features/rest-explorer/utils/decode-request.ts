/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  RequestDatasetEnum,
  type Body,
  type KeyValue,
  type KeyValueChecked,
  type Request,
  RequestDataTypeEnum,
  RequestMethodEnum,
} from "@sparrow/common/types/workspace";
import { ReduceAuthHeader, ReduceAuthParameter } from ".";
import { createDeepCopy } from "@sparrow/common/utils";
import { SetDataStructure } from "@sparrow/common/utils";

class DecodeRequest {
  constructor() {}

  /**
   * @description - Extracts the content type from the API response and sets it in the user's state.
   * @param responseHeaders - Response header object
   */
  public setResponseContentType = (
    responseHeaders: KeyValue[],
  ): RequestDataTypeEnum => {
    if (responseHeaders) {
      for (let i = 0; i < responseHeaders.length; i++) {
        const key = responseHeaders[i].key;
        const value = responseHeaders[i].value;
        if (key === "content-type" && value.includes("text/html")) {
          return RequestDataTypeEnum.HTML;
        } else if (
          key === "content-type" &&
          value.includes("application/json")
        ) {
          return RequestDataTypeEnum.JSON;
        } else if (
          key === "content-type" &&
          value.includes("application/hal+json")
        ) {
          return RequestDataTypeEnum.JSON;
        } else if (
          key === "content-type" &&
          value.includes("application/xml")
        ) {
          return RequestDataTypeEnum.XML;
        } else if (
          key === "content-type" &&
          value.includes("application/javascript")
        ) {
          return RequestDataTypeEnum.JAVASCRIPT;
        } else if (key === "content-type" && value.startsWith("image/")) {
          return RequestDataTypeEnum.IMAGE;
        } else if (key === "content-type") {
          return RequestDataTypeEnum.TEXT;
        }
      }
    }
    return RequestDataTypeEnum.TEXT;
  };

  /**
   * Checks if http/https is present or not and modify url
   * @param str - Url String
   */
  private ensureHttpOrHttps = (str: string) => {
    if (str.startsWith("http://") || str.startsWith("https://")) {
      return "";
    } else if (str.startsWith("//")) {
      return "http:";
    } else {
      return "http://";
    }
  };

  /**
   * Return only checked Key Value Pairs
   * @param pairs - Key value Pairs
   * @returns
   */
  private extractKeyValue = (pairs: KeyValueChecked[]): KeyValue[] => {
    const checkedPairs = [];
    for (const pair of pairs) {
      if (pair?.checked) {
        checkedPairs.push(pair);
      }
    }
    return checkedPairs;
  };

  /**
   * Extracts and modifies a URL based on authentication parameters and environment variables.
   * @param url - Request Url
   * @param request - Request Tab
   * @param environmentVariables - Environment Variables Array
   * @returns {string} Modified Url
   */
  private extractURL = (
    url: string,
    request: Request,
    environmentVariables,
  ): string => {
    // Get authentication header
    url = url.trim();
    const authHeader: {
      key: string;
      value: string;
    } = new ReduceAuthParameter(request.state, request.auth).getValue();
    url = url.trim();
    // Check if authentication header exists
    if (authHeader.key || authHeader.value) {
      let flag: boolean = false;
      // Check if URL already has query parameters
      for (let i = 0; i < url.length; i++) {
        if (url[i] === "?") {
          flag = true;
        }
      }

      if (!flag) {
        url = this.ensureHttpOrHttps(url) + url + "?";
      } else {
        url = this.ensureHttpOrHttps(url) + url + "&";
      }

      url = this.setEnvironmentVariables(
        url + authHeader.key + "=" + authHeader.value,
        environmentVariables,
      );
      return url;
    }
    return this.ensureHttpOrHttps(url) + url;
  };

  /**
   * Extracts and combines headers from different sources, including auto-generated headers and authentication headers.
   * @param {KeyValuePair[]} headers - Headers provided by the user.
   * @param {KeyValuePair[]} autoGeneratedHeaders - Auto-generated headers.
   * @param {NewTab} request - Request Tab.
   * @returns {string} Stringified Headers Array.
   */
  private extractHeaders = (
    headers: KeyValueChecked[],
    autoGeneratedHeaders: KeyValueChecked[],
    request: Request,
    environmentVariables = [],
  ): string => {
    // inject environment variable to basic auth before encryption
    const auth = createDeepCopy(request.auth);
    auth.basicAuth.username = this.setEnvironmentVariables(
      auth.basicAuth.username,
      environmentVariables,
    );
    auth.basicAuth.password = this.setEnvironmentVariables(
      auth.basicAuth.password,
      environmentVariables,
    );

    const authHeader: {
      key: string;
      value: string;
    } = new ReduceAuthHeader(request.state, auth).getValue();

    // Combine headers from different sources

    const combinedHeaders = this.extractKeyValue([
      ...autoGeneratedHeaders,
      ...headers,
    ]);

    // Add auth header if it exists
    if (authHeader.key || authHeader.value) {
      combinedHeaders.unshift({
        ...authHeader,
      });
    }

    // removes header with same key attribute
    const uniqueHeaders = new SetDataStructure().pushArrayOfObjects(
      combinedHeaders.toReversed(),
      "key",
    );

    // removes header with unused key attributes
    const res = uniqueHeaders.filter((elem) => {
      if (
        elem.key === "" ||
        elem.key.toLowerCase() === "content-length"
        // || elem.key.toLowerCase() === "content-type" // if required or not (research in progress)
      )
        return false;
      return true;
    });

    return JSON.stringify(res);
  };

  /**
   * Extracts and formats the request body based on the specified data type.
   * @param {RequestDatasetType} datatype - Body Type
   * @param {RequestRawType} rawData - Raw Body Type
   * @param {Body} body - Request Body
   * @returns {string} Stringified Body
   */
  private extractBody = (
    datatype: RequestDatasetEnum,
    rawData: RequestDataTypeEnum,
    body: Body,
  ): string => {
    const { raw, urlencoded, formdata } = body;
    if (datatype === RequestDatasetEnum.RAW) {
      if (rawData === RequestDataTypeEnum.JSON && raw === "") {
        return "{}";
      }
      return raw;
    } else if (datatype === RequestDatasetEnum.FORMDATA) {
      const bodyArray = [];
      const textBodyArray = this.extractKeyValue(
        formdata.map((pair) => {
          if (pair.type == "text") {
            return {
              key: pair.key,
              value: pair.value,
              checked: pair.checked,
            };
          }
        }),
      );
      const fileBodyArray = this.extractKeyValue(
        formdata.map((pair) => {
          if (pair.type == "file") {
            return {
              key: pair.key,
              value: pair.value,
              checked: pair.checked,
              base: pair.base,
            };
          }
        }),
      );

      // const textBodyArray = this.extractKeyValue(formdata.text);
      // const fileBodyArray = this.extractKeyValue(formdata.file);
      // bodyArray.push(...this.extractKeyValue(formdata));
      bodyArray.push(...textBodyArray);
      bodyArray.push(...fileBodyArray);
      return JSON.stringify(bodyArray);
    } else if (datatype === RequestDatasetEnum.URLENCODED) {
      return JSON.stringify(this.extractKeyValue(urlencoded));
    } else if (datatype === RequestDatasetEnum.NONE) {
      return "";
    }
    return "";
  };

  /**
   * Extracts and formats the HTTP request method.
   * @param method - Request Method Type
   * @returns - Request Method
   */
  private extractMethod = (method: RequestMethodEnum): string => {
    if (method === RequestMethodEnum.DELETE) {
      return "DELETE";
    } else if (method === RequestMethodEnum.GET) {
      return "GET";
    } else if (method === RequestMethodEnum.HEAD) {
      return "HEAD";
    } else if (method === RequestMethodEnum.OPTIONS) {
      return "OPTIONS";
    } else if (method === RequestMethodEnum.PATCH) {
      return "PATCH";
    } else if (method === RequestMethodEnum.POST) {
      return "POST";
    } else if (method === RequestMethodEnum.PUT) {
      return "PUT";
    }
    return "";
  };

  /**
   * Extracts and formats the data type of the request body.
   * @param {RequestDatasetType} datatype - Request Body Type
   * @param raw - Raw Body Type
   * @returns {string} - Formatted Body Type
   */
  private extractDataType = (
    datatype: RequestDatasetEnum,
    raw: RequestDataTypeEnum,
  ): string => {
    if (datatype === RequestDatasetEnum.RAW) {
      if (raw === RequestDataTypeEnum.JSON) {
        return "application/json";
      } else {
        return "text/plain";
      }
    } else if (datatype === RequestDatasetEnum.FORMDATA) {
      return "multipart/form-data";
    } else if (datatype === RequestDatasetEnum.URLENCODED) {
      return "application/x-www-form-urlencoded";
    } else if (datatype === RequestDatasetEnum.NONE) {
      return "text/plain";
    }
    return "";
  };

  /**
   * Sets environment variables in a given text by replacing placeholders with corresponding values.
   * @param {string} text - The text containing placeholders for environment variables.
   * @param environmentVariables - Array of objects containing key-value pairs for environment variables.
   * @returns {string} The text with placeholders replaced by environment variable values.
   */
  private setEnvironmentVariables = (
    text: string,
    environmentVariables,
  ): string => {
    let updatedText = text;
    environmentVariables.forEach((element) => {
      const regex = new RegExp(`{{(${element.key})}}`, "g");
      updatedText = updatedText.replace(regex, element.value);
    });
    return updatedText;
  };

  /**
   * Extract details from request and return formatted form of Request
   * @param request - User Request
   * @param environmentVariables - Array of objects containing key-value pairs for environment variables.
   */
  public init(request: Request, environmentVariables): string[] {
    return [
      this.extractURL(
        this.setEnvironmentVariables(request.url, environmentVariables),
        request,
        environmentVariables,
      ),
      this.extractMethod(request.method),
      this.setEnvironmentVariables(
        this.extractHeaders(
          request.headers,
          request.autoGeneratedHeaders,
          request,
          environmentVariables,
        ),
        environmentVariables,
      ),
      this.extractBody(
        request.state.requestBodyNavigation,
        request.state.requestBodyLanguage,
        request.body,
      ),
      this.extractDataType(
        request.state.requestBodyNavigation,
        request.state.requestBodyLanguage,
      ),
    ];
  }
}

export { DecodeRequest };
