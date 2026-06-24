import type { Meta, StoryObj } from '@storybook/react-vite'

import OfflineStatusBanner from './OfflineStatusBanner'

const meta = {
  title: 'Support/Status/OfflineStatusBanner',
  component: OfflineStatusBanner,
  args: {
    title: 'Offline shell loaded',
    description: 'The shell is available, but live data and actions need the network.',
  },
} satisfies Meta<typeof OfflineStatusBanner>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Admin: Story = {
  args: {
    title: 'Admin shell loaded offline',
    description: 'Admin data, HA controls, and saves remain unavailable until the connection returns.',
  },
}
