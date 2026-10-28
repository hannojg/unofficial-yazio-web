const YAZIO_USER_AGENT =
  "YAZIO/26.28.0 (com.yazio.android; build:607100145; Android 35) Ktor";

export function configureClientHeader() {
  const rule: chrome.declarativeNetRequest.Rule = {
    id: 1,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        { header: "user-agent", operation: "set", value: YAZIO_USER_AGENT },
      ],
    },
    condition: {
      urlFilter: "|https://yzapi.yazio.com/v22/",
      initiatorDomains: [chrome.runtime.id],
      resourceTypes: ["xmlhttprequest"],
    },
  };
  return chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [rule.id],
    addRules: [rule],
  });
}
