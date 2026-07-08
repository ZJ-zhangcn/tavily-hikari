import type { Meta, StoryObj } from '@storybook/react-vite'

import TokenListActions from './TokenListActions'
import { EN } from './text'
import type { TokenSecretCopyState } from '../components/TokenSecretField'

const meta = {
  title: 'User Console/TokenListActions',
  component: TokenListActions,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Compact token-row action cluster used in the user console token table and mobile token cards.',
      },
    },
  },
  args: {
    tokenId: 'k8eH',
    text: EN.tokens,
    copyState: 'idle',
    canReset: true,
  },
} satisfies Meta<typeof TokenListActions>

export default meta

type Story = StoryObj<typeof meta>

const noop = (): void => undefined
const isCopyIntentKey = (key: string): boolean => key === 'Enter' || key === ' '
const defaultArgs = {
  tokenId: 'k8eH',
  text: EN.tokens,
  copyState: 'idle' as TokenSecretCopyState,
  onScheduleWarmSecret: noop,
  onCancelWarmSecret: noop,
  onWarmSecret: noop,
  onCopy: noop,
  onDetail: noop,
  onReset: noop,
  isCopyIntentKey,
  canReset: true,
}

function renderActions(copyState: TokenSecretCopyState, canReset = true): JSX.Element {
  return (
    <TokenListActions
      tokenId="k8eH"
      text={EN.tokens}
      copyState={copyState}
      onScheduleWarmSecret={noop}
      onCancelWarmSecret={noop}
      onWarmSecret={noop}
      onCopy={noop}
      onDetail={noop}
      onReset={noop}
      isCopyIntentKey={isCopyIntentKey}
      canReset={canReset}
    />
  )
}

export const Playground: Story = {
  args: defaultArgs,
  render: (args) => (
    <TokenListActions
      {...args}
      onScheduleWarmSecret={noop}
      onCancelWarmSecret={noop}
      onWarmSecret={noop}
      onCopy={noop}
      onDetail={noop}
      onReset={noop}
      isCopyIntentKey={isCopyIntentKey}
    />
  ),
}

export const StateGallery: Story = {
  args: defaultArgs,
  render: () => (
    <div
      data-testid="token-list-actions-state-gallery"
      className="grid min-w-[420px] gap-4 rounded-[20px] border border-border/55 bg-card/82 p-5 shadow-clayCard"
    >
      {[
        ['Idle copy', renderActions('idle')],
        ['Copied', renderActions('copied')],
        ['Copy failed', renderActions('error')],
        ['Reset unavailable', renderActions('idle', false)],
      ].map(([label, actions]) => (
        <div key={label as string} className="grid grid-cols-[130px_1fr] items-center gap-4">
          <span className="text-sm font-bold text-muted-foreground">{label}</span>
          {actions}
        </div>
      ))}
    </div>
  ),
}

export const DarkStateGallery: Story = {
  args: defaultArgs,
  globals: {
    themeMode: 'dark',
  },
  parameters: {
    viewport: { defaultViewport: '1440-device-desktop' },
    docs: {
      description: {
        story:
          'Dark-theme proof for copy, detail, reset, and disabled reset action colors inside a compact token-row action group.',
      },
    },
  },
  render: StateGallery.render,
}
