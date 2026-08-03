import type { Router, RouteRecordRaw } from 'vue-router';

import { createRouter, createWebHistory } from 'vue-router';

import { describe, expect, it, vi } from 'vitest';

import {
  convertServerMenuToRouteRecordStringComponent,
  generateMenus,
} from '../generate-menus';

// Nested route setup to test child inclusion and hideChildrenInMenu functionality

describe('generateMenus', () => {
  // 模拟路由数据
  const mockRoutes = [
    {
      meta: { icon: 'home-icon', title: '首页' },
      name: 'home',
      path: '/home',
    },
    {
      meta: { hideChildrenInMenu: true, icon: 'about-icon', title: '关于' },
      name: 'about',
      path: '/about',
      children: [
        {
          path: 'team',
          name: 'team',
          meta: { icon: 'team-icon', title: '团队' },
        },
      ],
    },
  ] as RouteRecordRaw[];

  // 模拟 Vue 路由器实例
  const mockRouter = {
    getRoutes: vi.fn(() => [
      { name: 'home', path: '/home' },
      { name: 'about', path: '/about' },
      { name: 'team', path: '/about/team' },
    ]),
  };

  it('the correct menu list should be generated according to the route', async () => {
    const expectedMenus = [
      {
        badge: undefined,
        badgeType: undefined,
        badgeVariants: undefined,
        icon: 'home-icon',
        name: '首页',
        order: undefined,
        parent: undefined,
        parents: undefined,
        path: '/home',
        show: true,
        children: [],
      },
      {
        badge: undefined,
        badgeType: undefined,
        badgeVariants: undefined,
        icon: 'about-icon',
        name: '关于',
        order: undefined,
        parent: undefined,
        parents: undefined,
        path: '/about',
        show: true,
        children: [],
      },
    ];

    const menus = generateMenus(mockRoutes, mockRouter as any);
    expect(menus).toEqual(expectedMenus);
  });

  it('includes additional meta properties in menu items', async () => {
    const mockRoutesWithMeta = [
      {
        meta: { icon: 'user-icon', order: 1, title: 'Profile' },
        name: 'profile',
        path: '/profile',
      },
    ] as RouteRecordRaw[];

    const menus = generateMenus(mockRoutesWithMeta, mockRouter as any);
    expect(menus).toEqual([
      {
        badge: undefined,
        badgeType: undefined,
        badgeVariants: undefined,
        icon: 'user-icon',
        name: 'Profile',
        order: 1,
        parent: undefined,
        parents: undefined,
        path: '/profile',
        show: true,
        children: [],
      },
    ]);
  });

  it('handles dynamic route parameters correctly', async () => {
    const mockRoutesWithParams = [
      {
        meta: { icon: 'details-icon', title: 'User Details' },
        name: 'userDetails',
        path: '/users/:userId',
      },
    ] as RouteRecordRaw[];

    const menus = generateMenus(mockRoutesWithParams, mockRouter as any);
    expect(menus).toEqual([
      {
        badge: undefined,
        badgeType: undefined,
        badgeVariants: undefined,
        icon: 'details-icon',
        name: 'User Details',
        order: undefined,
        parent: undefined,
        parents: undefined,
        path: '/users/:userId',
        show: true,
        children: [],
      },
    ]);
  });

  it('processes routes with redirects correctly', async () => {
    const mockRoutesWithRedirect = [
      {
        name: 'redirectedRoute',
        path: '/old-path',
        redirect: '/new-path',
      },
      {
        meta: { icon: 'path-icon', title: 'New Path' },
        name: 'newPath',
        path: '/new-path',
      },
    ] as RouteRecordRaw[];

    const menus = generateMenus(mockRoutesWithRedirect, mockRouter as any);
    expect(menus).toEqual([
      // Assuming your generateMenus function excludes redirect routes from the menu
      {
        badge: undefined,
        badgeType: undefined,
        badgeVariants: undefined,
        icon: undefined,
        name: 'redirectedRoute',
        order: undefined,
        parent: undefined,
        parents: undefined,
        path: '/old-path',
        show: true,
        children: [],
      },
      {
        badge: undefined,
        badgeType: undefined,
        badgeVariants: undefined,
        icon: 'path-icon',
        name: 'New Path',
        order: undefined,
        parent: undefined,
        parents: undefined,
        path: '/new-path',
        show: true,
        children: [],
      },
    ]);
  });

  const routes: any = [
    {
      meta: { order: 2, title: 'Home' },
      name: 'home',
      path: '/',
    },
    {
      meta: { order: 1, title: 'About' },
      name: 'about',
      path: '/about',
    },
  ];

  const router: Router = createRouter({
    history: createWebHistory(),
    routes,
  });

  it('should generate menu list with correct order', async () => {
    const menus = generateMenus(routes, router);
    const expectedMenus = [
      {
        badge: undefined,
        badgeType: undefined,
        badgeVariants: undefined,
        icon: undefined,
        name: 'About',
        order: 1,
        parent: undefined,
        parents: undefined,
        path: '/about',
        show: true,
        children: [],
      },
      {
        badge: undefined,
        badgeType: undefined,
        badgeVariants: undefined,
        icon: undefined,
        name: 'Home',
        order: 2,
        parent: undefined,
        parents: undefined,
        path: '/',
        show: true,
        children: [],
      },
    ];

    expect(menus).toEqual(expectedMenus);
  });

  it('should handle empty routes', async () => {
    const emptyRoutes: any[] = [];
    const menus = generateMenus(emptyRoutes, router);
    expect(menus).toEqual([]);
  });
});

describe('convertServerMenuToRouteRecordStringComponent', () => {
  function createDuplicateDirectoryMenus() {
    return [
      {
        children: [
          {
            children: [],
            component: '',
            componentName: '',
            id: 101,
            name: '基础数据',
            parentId: 100,
            path: 'base-data',
            visible: true,
          },
        ],
        component: '',
        componentName: '',
        id: 100,
        name: 'ERP 系统',
        parentId: 0,
        path: '/erp',
        visible: true,
      },
      {
        children: [
          {
            children: [],
            component: '',
            componentName: '',
            id: 201,
            name: '基础数据',
            parentId: 200,
            path: 'base-data',
            visible: true,
          },
        ],
        component: '',
        componentName: '',
        id: 200,
        name: 'WMS 系统',
        parentId: 0,
        path: '/wms',
        visible: true,
      },
    ] as any;
  }

  it('uses id-based names for same-title directories under different parents', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const routes = convertServerMenuToRouteRecordStringComponent(
        createDuplicateDirectoryMenus(),
      );

      expect(routes[0]?.name).toBe('Menu_100');
      expect(routes[0]?.children?.[0]?.name).toBe('Menu_101');
      expect(routes[1]?.name).toBe('Menu_200');
      expect(routes[1]?.children?.[0]?.name).toBe('Menu_201');
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('keeps generated names stable when server menu order changes', () => {
    const forward = convertServerMenuToRouteRecordStringComponent(
      createDuplicateDirectoryMenus(),
    );
    const reverse = convertServerMenuToRouteRecordStringComponent(
      createDuplicateDirectoryMenus().toReversed(),
    );
    const toNameByPath = (
      routes: ReturnType<typeof convertServerMenuToRouteRecordStringComponent>,
    ) =>
      Object.fromEntries(
        routes.flatMap((route) => [
          [route.path, route.name],
          ...((route.children ?? []).map((child) => [
            child.path,
            child.name,
          ]) as [string, unknown][]),
        ]),
      );

    expect(toNameByPath(reverse)).toEqual(toNameByPath(forward));
  });

  it('uses stable id-based names for same-title external links', () => {
    const routes = convertServerMenuToRouteRecordStringComponent([
      {
        componentName: '',
        id: 301,
        name: '帮助中心',
        parentId: 0,
        path: 'https://example.com/help',
        visible: true,
      },
      {
        componentName: '',
        id: 302,
        name: '帮助中心',
        parentId: 0,
        path: 'https://example.org/help',
        visible: true,
      },
    ] as any);

    expect(routes.map((route) => route.name)).toEqual([
      'External_301',
      'External_302',
    ]);
    expect(routes.map((route) => route.meta.title)).toEqual([
      '帮助中心',
      '帮助中心',
    ]);
  });

  it('still reports duplicate non-empty component names', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const routes = convertServerMenuToRouteRecordStringComponent([
        {
          component: 'first/index',
          componentName: 'SharedPage',
          id: 401,
          name: '页面一',
          parentId: 0,
          path: '/first',
          visible: true,
        },
        {
          component: 'second/index',
          componentName: 'SharedPage',
          id: 402,
          name: '页面二',
          parentId: 0,
          path: '/second',
          visible: true,
        },
      ] as any);

      expect(routes.map((route) => route.name)).toEqual([
        'SharedPage',
        'SharedPage_402',
      ]);
      expect(errorSpy).toHaveBeenCalledWith(
        'menu componentName duplicate: SharedPage, id: 402',
        expect.objectContaining({ id: 402 }),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
