import { render, screen } from '@testing-library/react';
import { OfflineProvider, useOffline } from '@/app/(providers)/OfflineProvider';

function TestComponent() {
  const { isOffline, wasOffline } = useOffline();
  return (
    <div>
      <span data-testid="isOffline">{isOffline.toString()}</span>
      <span data-testid="wasOffline">{wasOffline.toString()}</span>
    </div>
  );
}

describe('useOffline', () => {
  beforeEach(() => {
    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
    });
  });

  it('should return isOffline as false when online', () => {
    render(
      <OfflineProvider>
        <TestComponent />
      </OfflineProvider>
    );

    expect(screen.getByTestId('isOffline')).toHaveTextContent('false');
    expect(screen.getByTestId('wasOffline')).toHaveTextContent('false');
  });

  it('should detect offline state', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false,
    });

    render(
      <OfflineProvider>
        <TestComponent />
      </OfflineProvider>
    );

    expect(screen.getByTestId('isOffline')).toHaveTextContent('true');
  });

  it('should register event listeners', () => {
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

    render(
      <OfflineProvider>
        <TestComponent />
      </OfflineProvider>
    );

    expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

    addEventListenerSpy.mockRestore();
  });

  it('should cleanup event listeners on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = render(
      <OfflineProvider>
        <TestComponent />
      </OfflineProvider>
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

    removeEventListenerSpy.mockRestore();
  });
});
