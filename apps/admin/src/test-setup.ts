import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// RTL's asyncUtilTimeout defaults to 1000ms and races a loaded CI runner (ENG-3830).
configure({ asyncUtilTimeout: 15_000 });
