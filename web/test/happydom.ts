import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register({
  url: 'http://localhost/',
})

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
