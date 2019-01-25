import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import React, { Component, PureComponent } from 'react'
import { isValidElementType } from 'react-is'

import { ReactReduxContext } from './Context'

const stringifyComponent = Comp => {
  try {
    return JSON.stringify(Comp)
  } catch (err) {
    return String(Comp)
  }
}

export default function connectAdvanced(
  /*
    selectorFactory is a func that is responsible for returning the selector function used to
    compute new props from state, props, and dispatch. For example:

      export default connectAdvanced((dispatch, options) => (state, props) => ({
        thing: state.things[props.thingId],
        saveThing: fields => dispatch(actionCreators.saveThing(props.thingId, fields)),
      }))(YourComponent)

    Access to dispatch is provided to the factory so selectorFactories can bind actionCreators
    outside of their selector as an optimization. Options passed to connectAdvanced are passed to
    the selectorFactory, along with displayName and WrappedComponent, as the second argument.

    Note that selectorFactory is responsible for all caching/memoization of inbound and outbound
    props. Do not use connectAdvanced directly without memoizing results between calls to your
    selector, otherwise the Connect component will re-render on every state or props change.
  */
  /*
    selectorFactory 是一个函数，作用是生成 selector 函数，selector函数的作用是通过 state、props 和 dispatch
    计算出新的 props。例如：
      export default connectAdvanced((dispatch, options) => (state, props) => ({
        thing: state.things[props.thingId],
        saveThing: fields => dispatch(actionCreators.saveThing(props.thingId, fields)),
      }))(YourComponent)

    该工厂函数的签名是`(dispatch, options) => selector`，传入 dispatch，就可以让 selectorFactory 函数在
    selector 函数外部绑定 actionCreators。connectAdvanced 的 optios 参数在添加了 displayName 和
    WrappedComponent 字段之后，会被传给 selectorFactory 作为第二个参数。
    
    需要注意：selectorFactory 全权负责所有 props 进出的缓存和记忆。如果没有对 selector 返回结果进行缓存记忆，
    就不要直接使用 connectAdvanced，否则 Connect 组件会在每一次 state 或者 props 变化时 re-render。
  */
  selectorFactory,
  // options object:
  {
    // the func used to compute this HOC's displayName from the wrapped component's displayName.
    // probably overridden by wrapper functions such as connect()
    // 该函数通过被包装组件的 displayName 计算此 HOC 的 displayName。可以被包装函数覆盖，比如 connect()。
    getDisplayName = name => `ConnectAdvanced(${name})`,

    // shown in error messages
    // probably overridden by wrapper functions such as connect()
    methodName = 'connectAdvanced',

    // REMOVED: if defined, the name of the property passed to the wrapped element indicating the number of
    // calls to render. useful for watching in react devtools for unnecessary re-renders.
    renderCountProp = undefined,

    // determines whether this HOC subscribes to store changes
    shouldHandleStateChanges = true,

    // REMOVED: the key of props/context to get the store
    storeKey = 'store',

    // REMOVED: expose the wrapped component via refs
    withRef = false,

    // use React's forwardRef to expose a ref of the wrapped component
    forwardRef = false,

    // the context consumer to use
    context = ReactReduxContext,

    // additional options are passed through to the selectorFactory
    ...connectOptions
  } = {}
) {
  invariant(
    renderCountProp === undefined,
    `renderCountProp is removed. render counting is built into the latest React dev tools profiling extension`
  )

  invariant(
    !withRef,
    'withRef is removed. To access the wrapped instance, use a ref on the connected component'
  )

  const customStoreWarningMessage =
    'To use a custom Redux store for specific components,  create a custom React context with ' +
    "React.createContext(), and pass the context object to React-Redux's Provider and specific components" +
    ' like:  <Provider context={MyContext}><ConnectedComponent context={MyContext} /></Provider>. ' +
    'You may also pass a {context : MyContext} option to connect'

  invariant(
    storeKey === 'store',
    'storeKey has been removed and does not do anything. ' +
      customStoreWarningMessage
  )

  const Context = context

  // 返回真正的 HOC
  return function wrapWithConnect(WrappedComponent) {
    if (process.env.NODE_ENV !== 'production') {
      invariant(
        isValidElementType(WrappedComponent),
        `You must pass a component to the function returned by ` +
          `${methodName}. Instead received ${stringifyComponent(
            WrappedComponent
          )}`
      )
    }

    const wrappedComponentName =
      WrappedComponent.displayName || WrappedComponent.name || 'Component'

    const displayName = getDisplayName(wrappedComponentName)

    const selectorFactoryOptions = {
      ...connectOptions,
      getDisplayName,
      methodName,
      renderCountProp,
      shouldHandleStateChanges,
      storeKey,
      displayName,
      wrappedComponentName,
      WrappedComponent
    }

    const { pure } = connectOptions

    let OuterBaseComponent = Component
    let FinalWrappedComponent = WrappedComponent

    if (pure) {
      OuterBaseComponent = PureComponent
    }

    function makeDerivedPropsSelector() {
      let lastProps
      let lastState
      let lastDerivedProps
      let lastStore
      let sourceSelector

      // 选取 DerivedProps，并将其缓存以避免重复计算
      return function selectDerivedProps(state, props, store) {
        if (pure && lastProps === props && lastState === state) {
          return lastDerivedProps
        }

        if (store !== lastStore) {
          lastStore = store
          sourceSelector = selectorFactory(
            store.dispatch,
            selectorFactoryOptions
          )
        }

        lastProps = props
        lastState = state

        const nextProps = sourceSelector(state, props)

        if (lastDerivedProps === nextProps) {
          return lastDerivedProps
        }

        lastDerivedProps = nextProps
        return lastDerivedProps
      }
    }

    function makeChildElementSelector() {
      let lastChildProps, lastForwardRef, lastChildElement

      // 创建一个子元素并将其缓存起来，下次在参数不变的情况下直接返回
      return function selectChildElement(childProps, forwardRef) {
        if (childProps !== lastChildProps || forwardRef !== lastForwardRef) {
          lastChildProps = childProps
          lastForwardRef = forwardRef
          lastChildElement = (
            <FinalWrappedComponent {...childProps} ref={forwardRef} />
          )
        }

        return lastChildElement
      }
    }

    // HOC返回的组件
    class Connect extends OuterBaseComponent {
      constructor(props) {
        super(props)
        invariant(
          forwardRef ? !props.wrapperProps[storeKey] : !props[storeKey],
          'Passing redux store in props has been removed and does not do anything. ' +
            customStoreWarningMessage
        )

        // 为每一个组件实例创建一套selector，可以缓存属性和子元素
        this.selectDerivedProps = makeDerivedPropsSelector()
        this.selectChildElement = makeChildElementSelector()
        this.renderWrappedComponent = this.renderWrappedComponent.bind(this)
      }

      renderWrappedComponent(value) {
        invariant(
          value,
          `Could not find "store" in the context of ` +
            `"${displayName}". Either wrap the root component in a <Provider>, ` +
            `or pass a custom React context provider to <Provider> and the corresponding ` +
            `React context consumer to ${displayName} in connect options.`
        )
        const { storeState, store } = value

        let wrapperProps = this.props
        let forwardedRef

        if (forwardRef) {
          wrapperProps = this.props.wrapperProps
          forwardedRef = this.props.forwardedRef
        }

        // 获取 derivedProps
        let derivedProps = this.selectDerivedProps(
          storeState,
          wrapperProps,
          store
        )

        // 返回子元素
        return this.selectChildElement(derivedProps, forwardedRef)
      }

      render() {
        const ContextToUse = this.props.context || Context

        // 利用Context，context的value就是redux维护的全局状态
        // Provider 组件订阅了 redux store，当 store 状态有变就会触发调用 Provider 组件实例的 setState
        // 从而引起 re-render
        return (
          <ContextToUse.Consumer>
            {this.renderWrappedComponent}
          </ContextToUse.Consumer>
        )
      }
    }

    Connect.WrappedComponent = WrappedComponent
    Connect.displayName = displayName

    if (forwardRef) {
      const forwarded = React.forwardRef(function forwardConnectRef(
        props,
        ref
      ) {
        return <Connect wrapperProps={props} forwardedRef={ref} />
      })

      forwarded.displayName = displayName
      forwarded.WrappedComponent = WrappedComponent
      return hoistStatics(forwarded, WrappedComponent)
    }

    return hoistStatics(Connect, WrappedComponent)
  }
}
