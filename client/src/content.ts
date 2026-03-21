function getSelectedText() {
  return window.getSelection()?.toString().trim() ?? "";
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_PAGE_CONTEXT") {
    return false;
  }

  sendResponse({
    documentLanguage: document.documentElement.lang || undefined,
    title: document.title || "Untitled page",
    url: window.location.href,
    selectedText: getSelectedText()
  });

  return false;
});
