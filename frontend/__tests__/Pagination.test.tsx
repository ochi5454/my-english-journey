/**
 * Pagination コンポーネントのテスト
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { Pagination } from '../app/components/Pagination'

describe('Pagination', () => {
  const defaultProps = {
    total: 100,
    page: 1,
    pageSize: 25,
    onPageChange: jest.fn(),
    onPageSizeChange: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders pagination info correctly', () => {
    render(<Pagination {...defaultProps} />)

    // 表示件数の確認
    expect(screen.getByText('1-25 / 100件')).toBeInTheDocument()
  })

  it('renders page size selector', () => {
    render(<Pagination {...defaultProps} />)

    const select = screen.getByRole('combobox')
    expect(select).toHaveValue('25')
  })

  it('calls onPageSizeChange when page size is changed', () => {
    render(<Pagination {...defaultProps} />)

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '50' } })

    expect(defaultProps.onPageSizeChange).toHaveBeenCalledWith(50)
  })

  it('calls onPageChange when page button is clicked', () => {
    render(<Pagination {...defaultProps} page={2} />)

    const pageButtons = screen.getAllByRole('button')
    // 2ページ目のボタンをクリック（最初はprevボタン）
    const page3Button = pageButtons.find(btn => btn.textContent === '3')
    if (page3Button) {
      fireEvent.click(page3Button)
      expect(defaultProps.onPageChange).toHaveBeenCalledWith(3)
    }
  })

  it('disables previous button on first page', () => {
    render(<Pagination {...defaultProps} page={1} />)

    const buttons = screen.getAllByRole('button')
    const prevButton = buttons[0] // 最初のボタンは「‹」
    expect(prevButton).toBeDisabled()
  })

  it('disables next button on last page', () => {
    render(<Pagination {...defaultProps} page={4} total={100} pageSize={25} />)

    const buttons = screen.getAllByRole('button')
    const nextButton = buttons[buttons.length - 1] // 最後のボタンは「›」
    expect(nextButton).toBeDisabled()
  })

  it('handles zero total correctly', () => {
    render(<Pagination {...defaultProps} total={0} />)

    expect(screen.getByText('0-0 / 0件')).toBeInTheDocument()
  })

  it('displays correct range for middle pages', () => {
    render(<Pagination {...defaultProps} page={2} total={100} pageSize={25} />)

    expect(screen.getByText('26-50 / 100件')).toBeInTheDocument()
  })

  it('displays correct range for last page with partial results', () => {
    render(<Pagination {...defaultProps} page={5} total={110} pageSize={25} />)

    expect(screen.getByText('101-110 / 110件')).toBeInTheDocument()
  })

  it('renders custom page size options', () => {
    render(<Pagination {...defaultProps} pageSizeOptions={[5, 10, 20]} />)

    const select = screen.getByRole('combobox')
    const options = select.querySelectorAll('option')

    expect(options).toHaveLength(3)
    expect(options[0]).toHaveValue('5')
    expect(options[1]).toHaveValue('10')
    expect(options[2]).toHaveValue('20')
  })
})

describe('buildPageList helper function', () => {
  // buildPageList関数はPaginationコンポーネント内にあるため、
  // コンポーネントの動作を通じてテスト

  it('shows all pages when total is 7 or less', () => {
    render(<Pagination total={7} pageSize={1} page={1} onPageChange={jest.fn()} onPageSizeChange={jest.fn()} />)

    // 1〜7のすべてのページボタンが表示されることを確認
    for (let i = 1; i <= 7; i++) {
      expect(screen.getByRole('button', { name: String(i) })).toBeInTheDocument()
    }
  })

  it('shows ellipsis for many pages', () => {
    render(<Pagination total={1000} page={50} pageSize={10} onPageChange={jest.fn()} onPageSizeChange={jest.fn()} />)

    // 省略記号が表示されることを確認
    const ellipses = screen.getAllByText('…')
    expect(ellipses.length).toBeGreaterThan(0)
  })
})
