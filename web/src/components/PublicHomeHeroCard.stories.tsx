import type { Meta, StoryObj } from '@storybook/react-vite'

import { useTranslate } from '../i18n'
import LanguageSwitcher from './LanguageSwitcher'
import PublicHomeHeroCard, { type PublicHomeHeroCardProps } from './PublicHomeHeroCard'
import ThemeToggle from './ThemeToggle'

type HeroStoryArgs = Omit<
  PublicHomeHeroCardProps,
  'publicStrings' | 'topControls' | 'linuxDoHref' | 'onTokenAccessClick' | 'onAdminActionClick'
>

const ADMIN_LABEL = '__ADMIN_LABEL__'
const LOGIN_LABEL = '__LOGIN_LABEL__'

function HeroStory(args: HeroStoryArgs): JSX.Element {
  const strings = useTranslate().public
  const resolvedAdminLabel = (() => {
    if (args.adminActionLabel === ADMIN_LABEL) return strings.adminButton
    if (args.adminActionLabel === LOGIN_LABEL) return strings.adminLoginButton
    return args.adminActionLabel
  })()

  return (
    <div style={{ width: 'min(100%, 1120px)', minWidth: 0, maxWidth: 1120, margin: '0 auto', overflowX: 'clip' }}>
      <PublicHomeHeroCard
        {...args}
        adminActionLabel={resolvedAdminLabel}
        publicStrings={strings}
        topControls={(
          <>
            <ThemeToggle />
            <LanguageSwitcher />
          </>
        )}
      />
    </div>
  )
}

const baseArgs: HeroStoryArgs = {
  metricsLoading: false,
  summaryLoading: false,
  error: null,
  metrics: {
    monthlySuccess: 1240,
    dailySuccess: 87,
  },
  availableKeys: 7,
  totalKeys: 12,
  showAuthStatusLoading: false,
  showAuthStatusUnavailable: false,
  showLinuxDoLogin: false,
  showRegistrationPausedNotice: false,
  showTokenAccessButton: false,
  showAdminAction: false,
  adminActionLabel: LOGIN_LABEL,
}

const meta = {
  title: 'Public/PublicHomeHeroCard',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  render: (args) => <HeroStory {...args} />,
} satisfies Meta<HeroStoryArgs>

export default meta

type Story = StoryObj<typeof meta>

export const AuthStatusCheckingSlowStats: Story = {
  args: {
    ...baseArgs,
    metrics: null,
    availableKeys: null,
    totalKeys: null,
    metricsLoading: true,
    summaryLoading: true,
    showAuthStatusLoading: true,
    showTokenAccessButton: false,
    showAdminAction: false,
  },
}

export const AuthStatusUnavailable: Story = {
  args: {
    ...baseArgs,
    showAuthStatusUnavailable: true,
    showTokenAccessButton: true,
    showAdminAction: false,
  },
}

export const LoggedOutNoToken: Story = {
  args: {
    ...baseArgs,
    showLinuxDoLogin: true,
    showTokenAccessButton: true,
    showAdminAction: false,
  },
}

export const LoadBalancerVisualProof: Story = {
  args: {
    ...baseArgs,
    showLinuxDoLogin: true,
    showTokenAccessButton: true,
    showAdminAction: false,
  },
  parameters: {
    viewport: { defaultViewport: '1440-device-desktop' },
    docs: {
      description: {
        story:
          'Owner-approved public hero load-balancer visual. The static image is the first-frame reference; motion layers only add subtle routing highlights.',
      },
    },
  },
}

export const LoadBalancerVisualProofMobile: Story = {
  args: {
    ...baseArgs,
    showLinuxDoLogin: true,
    showTokenAccessButton: true,
    showAdminAction: false,
  },
  parameters: {
    viewport: { defaultViewport: '0390-device-iphone-14' },
    docs: {
      description: {
        story:
          'Mobile proof for the same load-balancer visual, verifying the image scales without cropped labels or route nodes.',
      },
    },
  },
}

export const LoggedOutRegistrationPaused: Story = {
  args: {
    ...baseArgs,
    showLinuxDoLogin: true,
    showRegistrationPausedNotice: true,
    showTokenAccessButton: true,
    showAdminAction: false,
  },
}

export const LoggedOutWithToken: Story = {
  args: {
    ...baseArgs,
    showLinuxDoLogin: true,
    showTokenAccessButton: false,
    showAdminAction: false,
  },
}

export const LoggedInNoPrivilege: Story = {
  args: {
    ...baseArgs,
    showLinuxDoLogin: false,
    showTokenAccessButton: false,
    showAdminAction: false,
  },
}

export const LoggedInBuiltinAuth: Story = {
  args: {
    ...baseArgs,
    showLinuxDoLogin: false,
    showTokenAccessButton: false,
    showAdminAction: true,
    adminActionLabel: LOGIN_LABEL,
  },
}

export const LoggedInAdmin: Story = {
  args: {
    ...baseArgs,
    showLinuxDoLogin: false,
    showTokenAccessButton: false,
    showAdminAction: true,
    adminActionLabel: ADMIN_LABEL,
  },
}

export const LoggedOutNoTokenWithBuiltinAuth: Story = {
  args: {
    ...baseArgs,
    showLinuxDoLogin: true,
    showTokenAccessButton: true,
    showAdminAction: true,
    adminActionLabel: LOGIN_LABEL,
  },
}

export const LoggedOutWithTokenBuiltinAuth: Story = {
  args: {
    ...baseArgs,
    showLinuxDoLogin: true,
    showTokenAccessButton: false,
    showAdminAction: true,
    adminActionLabel: LOGIN_LABEL,
  },
}

export const LoggedOutNoTokenAdmin: Story = {
  args: {
    ...baseArgs,
    showLinuxDoLogin: true,
    showTokenAccessButton: true,
    showAdminAction: true,
    adminActionLabel: ADMIN_LABEL,
  },
}

export const LoggedOutWithTokenAdmin: Story = {
  args: {
    ...baseArgs,
    showLinuxDoLogin: true,
    showTokenAccessButton: false,
    showAdminAction: true,
    adminActionLabel: ADMIN_LABEL,
  },
}
