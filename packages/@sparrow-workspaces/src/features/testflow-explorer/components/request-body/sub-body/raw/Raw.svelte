<script lang="ts">
  import { Editor } from "@sparrow/library/forms";
  import {
    isDynamicExpressionContent,
    addDynamicExpressionContent,
    updateIsCurrentExpression,
    requestBodyCursorPosition,
  } from "../../../../store";
  export let lang: "HTML" | "JSON" | "XML" | "JavaScript" | "Text" = "Text";
  export let value = "";
  export let isBodyBeautified = false;
  export let onUpdateRequestBody: (data: string) => void = () => {};
  export let updateBeautifiedState: (value: boolean) => void;
  export let selectedBlock;

  const handleCodeMirrorChange = (e: CustomEvent<string>) => {
    // console.log("the value -------------------------->", e.detail);
    // const updatedData = insertStringAtPosition(e.detail, 72, "[[hello]]");
    onUpdateRequestBody(e.detail);
  };

  let dynamicExpressionItems = $isDynamicExpressionContent?.filter(
    (item: any) =>
      item?.requestType === "body.raw" &&
      item?.method === "request" &&
      item?.blockName === selectedBlock?.data?.blockName,
  );

  const handleOpenDE = (id: string) => {
    const deItems = $isDynamicExpressionContent;
    const updatedItems = deItems.map((item) => {
      if (
        item.blockName === selectedBlock?.data?.blockName &&
        item.method === "request" &&
        item.requestType === "body.raw" &&
        item.id === id
      ) {
        return { ...item, isCurrentOpen: true };
      }
      return item;
    });
    isDynamicExpressionContent.set(updatedItems);
  };

  const removeDynamicExpression = (id: string) => {
    const deItems = $isDynamicExpressionContent;
    const filteredItems = deItems.filter((item) => item.id !== id);
    isDynamicExpressionContent.set(filteredItems);
  };

  const handleSetCursor = (cursorPosition: number) => {
    const cursorData = $requestBodyCursorPosition;
    const blockName = selectedBlock?.data?.blockName;
    if (blockName) {
      let found = false;
      const updatedCursorData = cursorData.map((item) => {
        if (item.blockName === blockName) {
          found = true;
          return { ...item, cursor: cursorPosition };
        }
        return item;
      });
      // If not found, add a new entry
      if (!found) {
        updatedCursorData.push({
          blockName,
          cursor: cursorPosition,
        });
      }
      requestBodyCursorPosition.set(updatedCursorData);
    }
  };
</script>

<div class="request-body position-relative">
  <Editor
    bind:lang
    bind:value
    on:change={handleCodeMirrorChange}
    isEditable={true}
    {isBodyBeautified}
    isDynamicExpression={true}
    {dynamicExpressionItems}
    {handleOpenDE}
    {handleSetCursor}
    {removeDynamicExpression}
    beautifySyntaxCallback={updateBeautifiedState}
  />
</div>
