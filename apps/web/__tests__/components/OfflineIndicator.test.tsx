import { render, screen } from '@testing-library/react';
import { OfflineIndicator } from '@platform/pwa/OfflineIndicator';
import * as OfflineProvider from '@platform/providers/OfflineProvider';

// Mock the useOffline hook
jest.mock('@platform/providers/OfflineProvider', () => ({
  useOffline: jest.fn(),
}));

const mockUseOffline = OfflineProvider.useOffline as jest.MockedFunction<
  typeof OfflineProvider.useOffline
>;

describe('OfflineIndicator', () => {
  it('should not render when online', () => {
    mockUseOffline.mockReturnValue({ isOffline: false, wasOffline: false });

    const { container } = render(<OfflineIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it('should show offline message when offline', () => {
    mockUseOffline.mockReturnValue({ isOffline: true, wasOffline: false });

    render(<OfflineIndicator />);
    expect(screen.getByText("You're offline")).toBeInTheDocument();
  });

  it('should show back online message when reconnected', () => {
    mockUseOffline.mockReturnValue({ isOffline: false, wasOffline: true });

    render(<OfflineIndicator />);
    expect(screen.getByText('Back online')).toBeInTheDocument();
  });
});
