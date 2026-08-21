// `DemoMarketDataProvider` is the forward-looking name: this provider is the
// shipping default source, not a test double. `MockMarketDataProvider` is the
// same class under the name it carried while it lived in
// `packages/frames/src/testing/`, kept so existing callers and the smoke suites
// need no churn. Prefer the Demo name in new code.
export {
  MockMarketDataProvider,
  MockMarketDataProvider as DemoMarketDataProvider,
  type MockMode,
} from "./mock-provider";
