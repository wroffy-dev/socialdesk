import { TEST_ENV } from './test-env';

Object.assign(process.env, TEST_ENV);
// Keep test output readable; mail bodies are still written to .data/mail.
console.info = () => {};
