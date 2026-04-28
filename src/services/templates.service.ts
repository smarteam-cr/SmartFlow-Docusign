import type {
  DocusignAdapter,
  TemplateSummary,
} from '../integrations/Docusign/index.js';

export interface TemplatesService {
  list(): Promise<TemplateSummary[]>;
}

export interface TemplatesServiceDeps {
  docusign: DocusignAdapter;
}

export function createTemplatesService(deps: TemplatesServiceDeps): TemplatesService {
  return {
    list(): Promise<TemplateSummary[]> {
      return deps.docusign.listTemplates();
    },
  };
}
