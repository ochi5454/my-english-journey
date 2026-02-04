/**
 * LegendList コンポーネントのテスト
 */
import { render, screen } from '@testing-library/react'
import { LegendList } from '../app/components/LegendList'

describe('LegendList', () => {
  const mockLegend = [
    { label: '80h超', desc: '長時間労働', bg: '#6b4f00', color: '#f7f2e2' },
    { label: '〜80h', desc: '特別条項上限超過', bg: '#d0a754', color: '#1a1200' },
    { label: '〜60h', desc: '特別条項上限', bg: '#e6a600', color: '#1a1200' },
    { label: '〜45h', desc: '労働基準法上限', bg: '#c7b202', color: '#0f0f0f' },
    { label: '〜30h', desc: '社内上限', bg: '#1f8a55', color: '#fdfdfd' },
    { label: '15h〜20h', desc: '', bg: '#5f86c6', color: '#fdfdfd' },
  ]

  it('renders all legend items', () => {
    render(<LegendList legend={mockLegend} />)

    mockLegend.forEach(item => {
      expect(screen.getByText(item.label)).toBeInTheDocument()
    })
  })

  it('renders descriptions for items with desc', () => {
    render(<LegendList legend={mockLegend} />)

    expect(screen.getByText('長時間労働')).toBeInTheDocument()
    expect(screen.getByText('特別条項上限超過')).toBeInTheDocument()
  })

  it('applies correct background colors to chips', () => {
    render(<LegendList legend={mockLegend} />)

    const chip = screen.getByText('80h超')
    expect(chip).toHaveStyle({ background: '#6b4f00', color: '#f7f2e2' })
  })

  it('renders empty list when legend is empty', () => {
    const { container } = render(<LegendList legend={[]} />)

    const legendDiv = container.querySelector('.sheet-legend')
    expect(legendDiv).toBeInTheDocument()
    expect(legendDiv?.children).toHaveLength(0)
  })

  it('renders single item correctly', () => {
    const singleLegend = [
      { label: 'テスト', desc: 'テスト説明', bg: '#ff0000', color: '#ffffff' },
    ]

    render(<LegendList legend={singleLegend} />)

    expect(screen.getByText('テスト')).toBeInTheDocument()
    expect(screen.getByText('テスト説明')).toBeInTheDocument()
  })
})
