/**
 * @author Yosuke Ota
 * issue https://github.com/vuejs/eslint-plugin-vue/issues/250
 */
'use strict'

// ------------------------------------------------------------------------------
// Requirements
// ------------------------------------------------------------------------------

const utils = require('eslint-plugin-vue/lib/utils')
const casing = require('eslint-plugin-vue/lib/utils/casing')
const { toRegExp } = require('eslint-plugin-vue/lib/utils/regexp')

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const allowedCaseOptions = ['PascalCase', 'kebab-case']
const defaultCase = 'PascalCase'

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'enforce specific casing for the component naming style in template',
      categories: undefined,
      url: 'https://eslint-plugin-vue-pug.rash.codes/rules/component-name-in-template-casing.html'
    },
    fixable: 'code',
    schema: [
      {
        enum: allowedCaseOptions
      },
      {
        type: 'object',
        properties: {
          globals: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true
          },
          ignores: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
            additionalItems: false
          },
          registeredComponentsOnly: {
            type: 'boolean'
          }
        },
        additionalProperties: false
      }
    ]
  },
  /** @param {RuleContext} context */
  create(context) {
    const caseOption = context.options[0]
    const options = context.options[1] || {}
    const caseType = allowedCaseOptions.includes(caseOption)
      ? caseOption
      : defaultCase
    /** @type {RegExp[]} */
    const ignores = (options.ignores || []).map(toRegExp)
    /** @type {string[]} */
    const globals = (options.globals || []).map(casing.pascalCase)
    const registeredComponentsOnly = options.registeredComponentsOnly !== false
    const parserServices =
      context.parserServices || context.sourceCode.parserServices
    const tokens =
      parserServices &&
      parserServices.getTemplateBodyTokenStore &&
      parserServices.getTemplateBodyTokenStore()

    /** @type { Set<string> } */
    const registeredComponents = new Set(globals)

    if (utils.isScriptSetup(context)) {
      // For <script setup>
      const globalScope = context.getSourceCode().scopeManager.globalScope
      if (globalScope) {
        // Only check find the import module
        const moduleScope = globalScope.childScopes.find(
          (scope) => scope.type === 'module'
        )
        for (const variable of (moduleScope && moduleScope.variables) || []) {
          registeredComponents.add(variable.name)
        }
      }
    }
    /**
     * Checks whether the given node is the verification target node.
     * @param {VElement} node element node
     * @returns {boolean} `true` if the given node is the verification target node.
     */
    function isVerifyTarget(node) {
      if (ignores.some((re) => re.test(node.rawName))) {
        // ignore
        return false
      }

      if (
        (!utils.isHtmlElementNode(node) && !utils.isSvgElementNode(node)) ||
        utils.isHtmlWellKnownElementName(node.rawName) ||
        utils.isSvgWellKnownElementName(node.rawName)
      ) {
        return false
      }

      if (!registeredComponentsOnly) {
        // If the user specifies registeredComponentsOnly as false, it checks all component tags.
        return true
      }

      // We only verify the registered components.
      return registeredComponents.has(casing.pascalCase(node.rawName))
    }

    let hasInvalidEOF = false

    return utils.defineTemplateBodyVisitor(
      context,
      {
        VElement(node) {
          if (hasInvalidEOF) {
            return
          }

          if (!isVerifyTarget(node)) {
            return
          }

          const name = node.rawName
          if (!casing.getChecker(caseType)(name)) {
            const startTag = node.startTag
            const open = tokens.getFirstToken(startTag)
            const casingName = casing.getExactConverter(caseType)(name)
            context.report({
              node: open,
              loc: open.loc,
              message: 'Component name "{{name}}" is not {{caseType}}.',
              data: {
                name,
                caseType
              },
              *fix(fixer) {
                yield fixer.replaceText(open, `${casingName}`)
              }
            })
          }
        }
      },
      {
        Program(node) {
          hasInvalidEOF = utils.hasInvalidEOF(node)
        },
        ...(registeredComponentsOnly
          ? utils.executeOnVue(context, (obj) => {
              for (const n of utils.getRegisteredComponents(obj)) {
                registeredComponents.add(n.name)
              }
            })
          : {})
      }
    )
  }
}
