export const EVENT_TYPES = [
  'FOLLOWED_ME',
  'UNFOLLOWED_ME', 
  'I_FOLLOWED',
  'I_UNFOLLOWED',
  'FOLLOW_REQUEST_SENT',
  'PENDING_REQUEST_CANCELLED'
] as const

export type EventType = typeof EVENT_TYPES[number]

export const eventUtils = {
  getEventVisuals: (eventType: string) => {
    switch (eventType) {
      case 'FOLLOWED_ME':
        return {
          iconName: 'UserCheck',
          color: 'bg-green-500 text-white',
          text: 'Started Following'
        }
      case 'UNFOLLOWED_ME':
        return {
          iconName: 'UserX', 
          color: 'bg-red-500 text-white',
          text: 'Unfollowed'
        }
      case 'I_FOLLOWED':
        return {
          iconName: 'LogIn',
          color: 'bg-blue-500 text-white',
          text: 'I Followed'
        }
      case 'I_UNFOLLOWED':
        return {
          iconName: 'LogOut',
          color: 'bg-gray-500 text-white', 
          text: 'I Unfollowed'
        }
      case 'FOLLOW_REQUEST_SENT':
        return {
          iconName: 'Plus',
          color: 'bg-purple-500 text-white',
          text: 'Follow Request Sent'
        }
      case 'PENDING_REQUEST_CANCELLED':
        return {
          iconName: 'X',
          color: 'bg-orange-500 text-white',
          text: 'Request Cancelled'
        }
      default:
        return {
          iconName: 'Hash',
          color: 'bg-gray-400 text-white',
          text: eventType
        }
    }
  }
}