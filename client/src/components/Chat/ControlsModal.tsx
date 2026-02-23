import React, { useMemo, useState, useCallback, useEffect } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { getConfigDefaults, getEndpointField } from 'librechat-data-provider';
import { useUserKeyQuery } from 'librechat-data-provider/react-query';
import { SlidersHorizontal } from 'lucide-react';
import type { TEndpointsConfig, TInterfaceConfig } from 'librechat-data-provider';
import { TooltipAnchor, useMediaQuery } from '@librechat/client';
import { useGetEndpointsQuery, useGetStartupConfig } from '~/data-provider';
import useSideNavLinks from '~/hooks/Nav/useSideNavLinks';
import { useLocalize } from '~/hooks';
import { useSidePanelContext } from '~/Providers';
import { cn } from '~/utils';

const defaultInterface = getConfigDefaults().interface;

export function ControlsModal() {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 767px)');
  const { endpoint } = useSidePanelContext();
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  const { data: keyExpiry = { expiresAt: undefined } } = useUserKeyQuery(endpoint ?? '');
  const [open, setOpen] = useState(false);

  const interfaceConfig = useMemo(
    () => (startupConfig?.interface ?? defaultInterface) as Partial<TInterfaceConfig>,
    [startupConfig],
  );

  const endpointType = useMemo(
    () => getEndpointField(endpointsConfig, endpoint, 'type'),
    [endpoint, endpointsConfig],
  );

  const userProvidesKey = useMemo(
    () => !!(endpointsConfig?.[endpoint ?? '']?.userProvide ?? false),
    [endpointsConfig, endpoint],
  );

  const keyProvided = useMemo(
    () => (userProvidesKey ? !!(keyExpiry.expiresAt ?? '') : true),
    [keyExpiry.expiresAt, userProvidesKey],
  );

  const closeModal = useCallback(() => setOpen(false), []);

  const links = useSideNavLinks({
    endpoint,
    endpointType,
    keyProvided,
    hidePanel: closeModal,
    interfaceConfig,
    endpointsConfig,
  }).filter((link) => link.id !== 'hide-panel');

  const defaultActive = useMemo(() => {
    const activePanel = localStorage.getItem('side:active-panel');
    return typeof activePanel === 'string' ? activePanel : undefined;
  }, []);

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (defaultActive && links.some((link) => link.id === defaultActive)) {
      return defaultActive;
    }
    return links[0]?.id ?? '';
  });

  useEffect(() => {
    if (links.length === 0) {
      setActiveTab('');
      return;
    }

    if (!links.some((link) => link.id === activeTab)) {
      const nextTab =
        defaultActive && links.some((link) => link.id === defaultActive)
          ? defaultActive
          : links[0].id;
      setActiveTab(nextTab);
    }
  }, [activeTab, defaultActive, links]);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
    localStorage.setItem('side:active-panel', value);
  }, []);

  return (
    <>
      <TooltipAnchor
        description={localize('com_ui_controls')}
        render={
          <button
            onClick={() => setOpen(true)}
            aria-label={localize('com_ui_controls')}
            className={cn(
              'inline-flex size-10 flex-shrink-0 items-center justify-center rounded-xl border border-border-light bg-presentation text-text-primary shadow-sm transition-all ease-in-out hover:bg-surface-active-alt',
            )}
          >
            <SlidersHorizontal className="icon-lg" aria-hidden="true" />
          </button>
        }
      />

      <Transition appear show={open}>
        <Dialog as="div" className="relative z-50" onClose={setOpen}>
          <TransitionChild
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black opacity-50 dark:opacity-80" aria-hidden="true" />
          </TransitionChild>

          <TransitionChild
            enter="ease-out duration-200"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-100"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
              <DialogPanel className="max-h-[90vh] w-full max-w-[680px] overflow-hidden rounded-xl rounded-b-lg bg-background pb-6 shadow-2xl backdrop-blur-2xl animate-in sm:rounded-2xl">
                <DialogTitle
                  className="mb-1 flex items-center justify-between p-6 pb-5 text-left"
                  as="div"
                >
                  <h2 className="text-lg font-medium leading-6 text-text-primary">
                    {localize('com_ui_controls')}
                  </h2>
                  <button
                    type="button"
                    className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-border-xheavy focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-surface-primary dark:focus:ring-offset-surface-primary"
                    onClick={closeModal}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5 text-text-primary"
                    >
                      <line x1="18" x2="6" y1="6" y2="18"></line>
                      <line x1="6" x2="18" y1="6" y2="18"></line>
                    </svg>
                    <span className="sr-only">{localize('com_ui_close_settings')}</span>
                  </button>
                </DialogTitle>
                <div className="max-h-[calc(90vh-120px)] overflow-auto px-6 md:w-[680px]">
                  <Tabs.Root
                    value={activeTab}
                    onValueChange={handleTabChange}
                    className="flex flex-col gap-6 md:flex-row"
                    orientation="vertical"
                  >
                    <Tabs.List
                      aria-label={localize('com_ui_controls')}
                      className={cn(
                        'min-w-auto max-w-auto relative -ml-[8px] flex flex-shrink-0 flex-nowrap overflow-auto sm:max-w-none',
                        isSmallScreen
                          ? 'flex-row rounded-xl bg-surface-secondary'
                          : 'sticky top-0 h-full flex-col',
                      )}
                    >
                      {links.map((link) => (
                        <Tabs.Trigger
                          key={link.id}
                          value={link.id}
                          className={cn(
                            'group relative z-10 m-1 flex items-center justify-start gap-2 rounded-xl px-2 py-1.5 transition-all duration-200 ease-in-out',
                            isSmallScreen
                              ? 'flex-1 justify-center text-nowrap p-1 px-3 text-sm text-text-secondary radix-state-active:bg-surface-hover radix-state-active:text-text-primary'
                              : 'bg-transparent text-text-secondary radix-state-active:bg-surface-tertiary radix-state-active:text-text-primary',
                          )}
                        >
                          <link.icon className="h-4 w-4" aria-hidden="true" />
                          {localize(link.title)}
                        </Tabs.Trigger>
                      ))}
                    </Tabs.List>

                    <div className="overflow-auto sm:w-full sm:max-w-none md:pr-0.5 md:pt-0.5">
                      {links.map((link) => (
                        <Tabs.Content key={link.id} value={link.id} tabIndex={-1}>
                          {link.Component && <link.Component />}
                        </Tabs.Content>
                      ))}
                    </div>
                  </Tabs.Root>
                </div>
              </DialogPanel>
            </div>
          </TransitionChild>
        </Dialog>
      </Transition>
    </>
  );
}
