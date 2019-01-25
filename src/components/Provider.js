import React, { Component } from 'react'
import PropTypes from 'prop-types'
import { ReactReduxContext } from './Context'

class Provider extends Component {
  constructor(props) {
    super(props)

    const { store } = props

    this.state = {
      storeState: store.getState(),
      store
    }
  }

  componentDidMount() {
    this._isMounted = true
    this.subscribe()
  }

  componentWillUnmount() {
    if (this.unsubscribe) this.unsubscribe()

    this._isMounted = false
  }

  componentDidUpdate(prevProps) {
    if (this.props.store !== prevProps.store) {
      if (this.unsubscribe) this.unsubscribe()

      this.subscribe()
    }
  }

  // 订阅store的变化，store 变化会触发调用 Provider 组件的 setState。
  // 从而引起 Comsumer 组件re-render
  subscribe() {
    const { store } = this.props

    this.unsubscribe = store.subscribe(() => {
      const newStoreState = store.getState()

      if (!this._isMounted) {
        return
      }

      this.setState(providerState => {
        // If the value is the same, skip the unnecessary state update.
        if (providerState.storeState === newStoreState) {
          return null
        }

        return { storeState: newStoreState }
      })
    })

    // Actions might have been dispatched between render and mount - handle those
    const postMountStoreState = store.getState()
    if (postMountStoreState !== this.state.storeState) {
      this.setState({ storeState: postMountStoreState })
    }
  }

  render() {
    // 可以传入自定义 context，否则使用默认的context，初始值为null
    const Context = this.props.context || ReactReduxContext

    return (
      <Context.Provider value={this.state}>
        {this.props.children}
      </Context.Provider>
    )
  }
}

Provider.propTypes = {
  store: PropTypes.shape({
    subscribe: PropTypes.func.isRequired,
    dispatch: PropTypes.func.isRequired,
    getState: PropTypes.func.isRequired
  }),
  context: PropTypes.object,
  children: PropTypes.any
}

export default Provider
