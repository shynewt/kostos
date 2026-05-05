const MAX_EXPRESSION_LENGTH = 80

export function evaluateArithmeticExpression(expression: string): number | null {
  const input = expression.replace(/,/g, '.').replace(/\s+/g, '')
  if (!input || input.length > MAX_EXPRESSION_LENGTH || !/^[0-9.+\-*/()]+$/.test(input)) return null

  let index = 0

  const peek = () => input[index]
  const consume = () => input[index++]

  const parseNumber = (): number | null => {
    let value = ''
    while (/[0-9.]/.test(peek() || '')) value += consume()
    if (!value || value.split('.').length > 2) return null
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : null
  }

  const parseFactor = (): number | null => {
    if (peek() === '+') {
      consume()
      return parseFactor()
    }
    if (peek() === '-') {
      consume()
      const value = parseFactor()
      return value === null ? null : -value
    }
    if (peek() === '(') {
      consume()
      const value = parseExpression()
      if (peek() !== ')') return null
      consume()
      return value
    }
    return parseNumber()
  }

  const parseTerm = (): number | null => {
    let value = parseFactor()
    if (value === null) return null

    while (peek() === '*' || peek() === '/') {
      const operator = consume()
      const right = parseFactor()
      if (right === null) return null
      if (operator === '*') value *= right
      else {
        if (right === 0) return null
        value /= right
      }
    }

    return value
  }

  function parseExpression(): number | null {
    let value = parseTerm()
    if (value === null) return null

    while (peek() === '+' || peek() === '-') {
      const operator = consume()
      const right = parseTerm()
      if (right === null) return null
      value = operator === '+' ? value + right : value - right
    }

    return value
  }

  const result = parseExpression()
  if (result === null || index !== input.length || !Number.isFinite(result)) return null
  return result
}
