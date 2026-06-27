import type { Meta, StoryObj } from '@storybook/react-vite'

import UserConsoleHeader from './UserConsoleHeader'

const desktopViewport = { viewport: { defaultViewport: '1440-device-desktop' } } as const
const compactViewport = { viewport: { defaultViewport: '0920-breakpoint-content-compact-max' } } as const
const mobileViewport = { viewport: { defaultViewport: '0390-device-iphone-14' } } as const

const meta = {
  title: 'Console/UserConsoleHeader',
  component: UserConsoleHeader,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  render: (args) => (
    <div style={{ maxWidth: 1360, margin: '0 auto' }}>
      <UserConsoleHeader {...args} />
    </div>
  ),
  args: {
    title: 'Tavily Hikari User Console',
    subtitle: 'Your account dashboard and token management',
    eyebrow: 'User Workspace',
    currentViewLabel: 'Current View',
    currentViewTitle: 'Overview',
    currentViewDescription: 'Track quotas, recent requests, and integration state.',
    sessionLabel: 'Signed in as',
    sessionDisplayName: 'Ivan',
    sessionProviderLabel: 'LinuxDo',
    adminLabel: 'Admin',
    isAdmin: true,
    adminHref: '/admin',
    adminActionLabel: 'Open Admin Dashboard',
    adminMenuLabel: 'Go to Admin',
    announcementsLabel: 'Open announcements',
    announcementCount: 2,
    logoutVisible: true,
    isLoggingOut: false,
    logoutLabel: 'Sign out',
    loggingOutLabel: 'Signing out…',
    onOpenAnnouncements: () => undefined,
    onLogout: () => undefined,
  },
} satisfies Meta<typeof UserConsoleHeader>

export default meta

type Story = StoryObj<typeof meta>

export const DesktopLanding: Story = {
  name: 'storybook_canvas / desktop-landing',
  parameters: desktopViewport,
}

export const TokenDetail: Story = {
  name: 'storybook_canvas / token-detail',
  args: {
    currentViewTitle: 'Token Detail',
    currentViewDescription: 'Inspect recent requests and quota windows.',
  },
  parameters: compactViewport,
}

export const MobileCollapsedActions: Story = {
  name: 'storybook_canvas / mobile-collapsed-actions',
  args: {
    title: '用户控制台',
    subtitle: '账户仪表盘与 Token 管理',
    eyebrow: '用户工作区',
    currentViewLabel: '当前视图',
    currentViewTitle: 'Token 列表',
    currentViewDescription: '查看状态、配额窗口与最近请求。',
    sessionLabel: '当前账户',
    sessionDisplayName: 'Ivan',
    sessionProviderLabel: 'LinuxDo',
    adminLabel: '管理员',
    adminActionLabel: '打开管理后台',
    adminMenuLabel: '进入后台',
    announcementsLabel: '打开通知',
    logoutLabel: '退出登录',
    loggingOutLabel: '退出中…',
  },
  globals: {
    language: 'zh',
  },
  parameters: mobileViewport,
}

export const LongChineseSummary: Story = {
  name: '中文摘要',
  args: {
    title: '用户控制台',
    subtitle: '账户仪表盘与 Token 管理',
    eyebrow: '用户工作区',
    currentViewLabel: '当前视图',
    currentViewTitle: '额度与请求',
    currentViewDescription: '查看最近请求、额度刷新与错误窗口。',
    sessionLabel: '当前账户',
    sessionProviderLabel: 'LinuxDo',
    adminLabel: '管理员',
    adminActionLabel: '打开管理后台',
    adminMenuLabel: '进入后台',
    announcementsLabel: '打开通知',
    logoutLabel: '退出登录',
    loggingOutLabel: '退出中…',
  },
  globals: {
    language: 'zh',
  },
  parameters: desktopViewport,
}

export const DarkTheme: Story = {
  name: '暗色桌面',
  globals: {
    themeMode: 'dark',
  },
  parameters: desktopViewport,
}
