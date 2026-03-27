import React from 'react';
import { Box, Text } from 'ink';
import { colors } from './theme.js';
import { SIDEBAR_WIDTH } from './types.js';
import type { MainId, Level } from './types.js';
import { MAIN_MENU, MAIN_NAV_GROUPS, getSubmenu } from './types.js';

export interface SidebarProps {
    level: Level;
    menuIndex: number;
    /** When true, show focus border. */
    focused: boolean;
}

/**
 * Left nav: groups, selected state, full-width selection Box with background.
 */
export function Sidebar({ level, menuIndex, focused }: SidebarProps): React.ReactElement {
    const isMain = level === 'main';
    const submenu = getSubmenu(level);

    return (
        <Box
            width={SIDEBAR_WIDTH}
            borderStyle="single"
            borderColor={focused ? colors.amber : colors.dim}
            flexDirection="column"
            paddingX={0}
            paddingY={0}
        >
            <Box paddingX={1} paddingY={1}>
                <Text bold color={colors.amber}>
                    MOTEUR
                </Text>
            </Box>
            <Box paddingY={1} flexDirection="column">
                {isMain
                    ? MAIN_NAV_GROUPS.map(group => (
                          <Box key={group.label || group.ids.join('-')} flexDirection="column">
                              {group.label ? (
                                  <Box paddingX={1} marginTop={1}>
                                      <Text color={colors.dim}>{group.label}</Text>
                                  </Box>
                              ) : null}
                              {group.ids.map(id => {
                                  const idx = MAIN_MENU.findIndex(m => m.id === id);
                                  const active = idx === menuIndex;
                                  const label = MAIN_MENU[idx]?.label ?? '';
                                  return (
                                      <Box key={id} width={SIDEBAR_WIDTH} paddingX={1} paddingY={0}>
                                          <Text
                                              backgroundColor={
                                                  active ? colors.selectedBg : undefined
                                              }
                                              color={active ? colors.selectedFg : colors.bright}
                                              bold={active}
                                          >
                                              {active ? '▸' : ' '}
                                              {label}
                                          </Text>
                                      </Box>
                                  );
                              })}
                          </Box>
                      ))
                    : submenu.map((item, i) => {
                          const active = i === menuIndex;
                          return (
                              <Box
                                  key={item.screen}
                                  width={SIDEBAR_WIDTH}
                                  paddingX={1}
                                  paddingY={0}
                              >
                                  <Text
                                      backgroundColor={active ? colors.selectedBg : undefined}
                                      color={active ? colors.selectedFg : colors.bright}
                                      bold={active}
                                  >
                                      {active ? '▸' : ' '}
                                      {item.label}
                                  </Text>
                              </Box>
                          );
                      })}
            </Box>
        </Box>
    );
}
