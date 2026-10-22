import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { File, Files, Folder } from 'fumadocs-ui/components/files';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { Mermaid } from '@/components/mdx/mermaid';
import type { ComponentProps } from 'react';
import type { MDXComponents } from 'mdx/types';
import { docsHref } from '@/lib/shared';

const DefaultCard = defaultMdxComponents.Card;

/** Content links are written as /docs/…; map them to this deployment's docs URLs. */
function Card({ href, ...props }: ComponentProps<typeof DefaultCard>) {
  return <DefaultCard href={href ? docsHref(href) : href} {...props} />;
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Card,
    Accordion,
    Accordions,
    File,
    Files,
    Folder,
    Mermaid,
    Step,
    Steps,
    Tab,
    Tabs,
    TypeTable,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
